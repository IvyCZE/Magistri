package cz.prehled.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import cz.prehled.app.bridge.PrehledNativePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrehledNativePlugin.class);
        super.onCreate(savedInstanceState);
        // The page hides its own scrollbars; this also removes the WebView's native scroll indicator.
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    }
}
