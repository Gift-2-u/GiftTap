# Gift2U Play release — R8 / ProGuard keeps (Expo + RN + AdMob WebView shell)

# react-native-reanimated / worklets
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.common.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native / Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { native <methods>; }

# Expo modules
-keep class expo.modules.** { *; }
-keep class expo.modules.adapters.** { *; }

# Google Mobile Ads
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.ads.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.ads.**

# OkHttp / networking (RN fetch)
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Keep line numbers for Play / crash deobfuscation (upload mapping.txt)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Prefer not to strip useful annotations
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
