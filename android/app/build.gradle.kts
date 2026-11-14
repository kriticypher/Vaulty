// app module — a tiny native shell (WebView) around the Vaultly React frontend.
// No external dependencies: plain framework Activity + WebView, so the build
// stays simple and fast for the team.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vaulty.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.vaulty.app"
        minSdk = 26        // Android 8.0 — adaptive icons supported, no PNG fallbacks needed
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Intentionally empty — the shell uses only android.webkit + android.app.
}
