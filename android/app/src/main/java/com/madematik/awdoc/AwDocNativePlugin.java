package com.madematik.awdoc;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Window;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

/**
 * What the WebView cannot do itself: picking a file the app may write again, writing it, saving a
 * new file where the user chooses, the print service, hiding and colouring the system bars, the
 * back button and reading a file another app hands over. The web side is src/platform/android.ts.
 */
@CapacitorPlugin(name = "AwDocNative")
public class AwDocNativePlugin extends Plugin {

    private static final int COPY_BUFFER_BYTES = 64 * 1024;
    private static final int READ_WRITE = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** The file being read; `readFile` serves it until the next one arrives. */
    private FileInputStream openedFile;
    private int openedId = 0;
    /** The interface's colour for the system bars; null until the page has said it. */
    private Integer barColor;
    private boolean darkBars = false;

    /** Without this the back button would close the app, whatever is open on the page. */
    @Override
    public void load() {
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners("backButton")) notifyListeners("backButton", new JSObject());
                else getActivity().moveTaskToBack(true);
            }
        });
    }

    @PluginMethod
    public void leaveApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }

    /**
     * Capacitor sends the intent that starts the app through here too: "open with" (an awDOC file)
     * or "share" (a picture from awPDF, the gallery or the camera, which goes into the document).
     */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = sharedStream(intent);
        if (uri == null) return;
        Uri file = uri;
        getBridge().execute(() -> sendFile(file));
    }

    @SuppressWarnings("deprecation")
    private static Uri sharedStream(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    /**
     * Android's own picker: unlike the WebView's, it gives a document the app may write again
     * ("Kaydet" then writes the same file). Any type: the page decides by the name.
     */
    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(READ_WRITE | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "filePicked");
    }

    @ActivityCallback
    private void filePicked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            getBridge().execute(() -> sendFile(uri));
        }
        call.resolve();
    }

    /** The recent list's way back to a file; on the same thread as `readFile`. */
    @PluginMethod
    public void reopenFile(PluginCall call) {
        call.resolve(openFile(Uri.parse(call.getString("source", ""))));
    }

    /** Retained until the page listens, since a tap can start the app before the page loads. */
    private void sendFile(Uri uri) {
        notifyListeners("fileOpened", openFile(uri), true);
    }

    private JSObject openFile(Uri uri) {
        closeOpenedFile();
        JSObject file = new JSObject();
        file.put("id", ++openedId);
        file.put("name", displayName(uri));
        // A shared picture's name may have no extension; its type tells what it is.
        String type = getContext().getContentResolver().getType(uri);
        if (type != null) file.put("type", type);
        try {
            ParcelFileDescriptor descriptor = seekableDescriptor(uri);
            file.put("size", descriptor.getStatSize());
            openedFile = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
            if (keepAccess(uri)) file.put("source", uri.toString());
        } catch (IOException | SecurityException | IllegalArgumentException error) {
            file.put("size", -1);
        }
        return file;
    }

    /**
     * Keeps the right to write the file again, also after a restart. Files from the picker allow it;
     * many apps' "open with" grants only reading for this visit, and "Kaydet" then asks where to save.
     */
    private boolean keepAccess(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            resolver.takePersistableUriPermission(uri, READ_WRITE);
            return true;
        } catch (SecurityException refused) {
            return false;
        }
    }

    private void closeOpenedFile() {
        if (openedFile == null) return;
        try {
            openedFile.close();
        } catch (IOException ignored) {
            // Nothing more can be read from it either way.
        }
        openedFile = null;
    }

    private String displayName(Uri uri) {
        String[] columns = { OpenableColumns.DISPLAY_NAME };
        try (Cursor cursor = getContext().getContentResolver().query(uri, columns, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (SecurityException | IllegalArgumentException ignored) {
            // The address below still gives a usable name.
        }
        String segment = uri.getLastPathSegment();
        return segment == null ? "belge.awd" : new File(segment).getName();
    }

    /** Some apps hand out a pipe, with no size and no seeking; those go through the cache. */
    private ParcelFileDescriptor seekableDescriptor(Uri uri) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "r");
        if (descriptor != null && descriptor.getStatSize() >= 0) return descriptor;
        if (descriptor != null) descriptor.close();
        File copy = new File(cacheFolder("acilan"), "belge");
        try (InputStream input = resolver.openInputStream(uri); FileOutputStream output = new FileOutputStream(copy)) {
            if (input == null) throw new FileNotFoundException(uri.toString());
            copy(input, output);
        }
        return ParcelFileDescriptor.open(copy, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    /** Runs on the same thread as `openFile`, so the file cannot change under it. */
    @PluginMethod
    public void readFile(PluginCall call) {
        if (openedFile == null || call.getInt("id", 0) != openedId) {
            call.reject("Dosya artık açık değil.");
            return;
        }
        long begin = call.getData().optLong("begin");
        ByteBuffer bytes = ByteBuffer.allocate((int) (call.getData().optLong("end") - begin));
        try {
            FileChannel channel = openedFile.getChannel();
            while (bytes.hasRemaining() && channel.read(bytes, begin + bytes.position()) > 0) {
                // Each read continues where the last one stopped.
            }
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(bytes.array(), 0, bytes.position(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Dosya okunamadı.", error);
        }
    }

    /** The bridge carries text: what is to be written comes first, piece by piece, into the cache. */
    @PluginMethod
    public void appendOutput(PluginCall call) {
        boolean first = Boolean.TRUE.equals(call.getBoolean("first", false));
        try (FileOutputStream output = new FileOutputStream(outputCopy(), !first)) {
            output.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Belge kaydedilmeye hazırlanamadı.", error);
        }
    }

    /** Writes the waiting copy over the file the page opened or saved before. */
    @PluginMethod
    public void writeFile(PluginCall call) {
        Uri uri = Uri.parse(call.getString("source", ""));
        getBridge().execute(() -> {
            JSObject result = new JSObject();
            try {
                writeOutput(uri);
                result.put("written", true);
                call.resolve(result);
            } catch (SecurityException | FileNotFoundException refused) {
                // No right to write there (any more): the page asks where to save instead.
                result.put("written", false);
                call.resolve(result);
            } catch (IOException error) {
                call.reject("Belge kaydedilemedi.", error);
            }
        });
    }

    /** The system's "save" screen makes a new file; the app may write it again afterwards. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(fileType(call));
        intent.putExtra(Intent.EXTRA_TITLE, new File(call.getString("name", "Belge.awd")).getName());
        intent.addFlags(READ_WRITE | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "fileSaved");
    }

    @ActivityCallback
    private void fileSaved(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            outputCopy().delete();
            call.resolve(new JSObject());
            return;
        }
        Uri uri = data.getData();
        getBridge().execute(() -> {
            try {
                writeOutput(uri);
                JSObject saved = new JSObject();
                saved.put("name", displayName(uri));
                if (keepAccess(uri)) saved.put("source", uri.toString());
                call.resolve(saved);
            } catch (IOException | SecurityException error) {
                call.reject("Belge kaydedilemedi.", error);
            }
        });
    }

    private void writeOutput(Uri uri) throws IOException {
        File copy = outputCopy();
        try (InputStream input = new FileInputStream(copy);
             OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new FileNotFoundException(uri.toString());
            copy(input, output);
        } finally {
            copy.delete();
        }
    }

    /** Prints the page as it is, so the `@media print` styles decide what goes on paper. */
    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "awDOC");
        getActivity().runOnUiThread(() -> {
            PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            manager.print(name, getBridge().getWebView().createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (enabled) bars.hide(WindowInsetsCompat.Type.systemBars());
            else bars.show(WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }

    /**
     * The strips behind the status and navigation bars take the interface's colour, and their
     * icons turn light on a dark one. Capacitor's SystemBars puts its own background back after a
     * configuration change (a turn of the phone), so the colour is laid on again right after it.
     */
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        try {
            barColor = Color.parseColor(call.getString("color", "#ffffff"));
        } catch (IllegalArgumentException error) {
            call.reject("Renk okunamadı.", error);
            return;
        }
        darkBars = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            applySystemBars();
            call.resolve();
        });
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        if (barColor != null) new Handler(Looper.getMainLooper()).post(this::applySystemBars);
    }

    private void applySystemBars() {
        Window window = getActivity().getWindow();
        window.getDecorView().setBackgroundColor(barColor);
        window.setStatusBarColor(barColor);
        window.setNavigationBarColor(barColor);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(!darkBars);
        bars.setAppearanceLightNavigationBars(!darkBars);
    }

    /** Only the kinds the app saves (src/formats/index.ts). */
    private String fileType(PluginCall call) {
        String type = call.getString("type", "application/x-awdoc");
        return "text/plain".equals(type) ? type : "application/x-awdoc";
    }

    private File cacheFolder(String name) {
        File folder = new File(getContext().getCacheDir(), name);
        folder.mkdirs();
        return folder;
    }

    private File outputCopy() {
        return new File(cacheFolder("kaydedilen"), "belge");
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        for (int count = input.read(buffer); count >= 0; count = input.read(buffer)) {
            output.write(buffer, 0, count);
        }
    }
}
