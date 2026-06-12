# ScribeAI Android Client

轻量 WebView 壳应用，默认加载 [https://metting.ryledu.cn](https://metting.ryledu.cn)。

## 要求

- 最低系统版本：**Android 12（API 31）**
- Android Studio Ladybug（2024.2）或更新版本
- JDK 17

## 权限

应用启动时会申请以下权限，供网页录音、文件上传等功能使用：

| 权限 | 用途 |
|------|------|
| `INTERNET` / `ACCESS_NETWORK_STATE` | 访问 Web 服务 |
| `RECORD_AUDIO` | 会议录音 / `getUserMedia` 麦克风 |
| `CAMERA` | 页面请求摄像头时 |
| `READ_EXTERNAL_STORAGE`（API ≤ 32） | 选择本地文件 |
| `READ_MEDIA_*`（API 33+） | 选择图片/视频/音频 |

WebView 内网页请求麦克风/摄像头时，会通过 `WebChromeClient.onPermissionRequest` 二次授权。

## Android SDK

在 `local.properties` 中配置本机 SDK 路径（该文件不提交 Git）。Android Studio 首次打开项目时通常会自动生成：

```properties
sdk.dir=/path/to/your/Android/Sdk
```

也可将 SDK 放在项目目录下的 `.android-sdk/`（已在 `.gitignore` 中排除），例如：

```properties
sdk.dir=.android-sdk
```

命令行构建至少需要：`platform-tools`、`build-tools`（34+）、`platforms;android-35` 及 `licenses`。WebView 项目一般**不需要** NDK。

## 构建

1. 用 Android Studio 打开本目录 `Android-Client/`
2. 确认 `local.properties` 中 `sdk.dir` 指向有效 SDK
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**

命令行：

```bash

cd Android-Client
./gradlew assembleDebug

./gradlew assembleRelease

./gradlew assembleRelease --offline
```
#  Release 还需要签名密码
export ANDROID_KEYSTORE_PASSWORD='你的密码'
export ANDROID_KEY_PASSWORD='你的密码'

输出 APK：
- Debug：`app/build/outputs/apk/debug/app-debug.apk`
- Release：`app/build/outputs/apk/release/app-release.apk`

### 发布到 Web 供登录用户下载

编译 Release 后，将 APK 复制到后端下载目录：

```bash
mkdir -p ../backend/downloads
cp app/build/outputs/apk/release/app-release.apk ../backend/downloads/scribeai-android.apk
```

### 制作证书
```bash
keytool -genkey -v -keystore ~/scribeai-android.keystore -alias scribeai -keyalg RSA -keysize 2048 -validity 9125 -storetype PKCS12
```
登录用户在网站 **个人资料** 页可下载。也可通过环境变量 `ANDROID_APK_PATH` 自定义路径。

## 不提交到 Git 的文件

以下目录/文件已在 `.gitignore` 中排除，**请勿提交**：

| 路径 | 说明 |
|------|------|
| `.gradle/` | Gradle 缓存 |
| `build/`、`app/build/` | 编译临时与输出目录 |
| `local.properties` | 本机 Android SDK 路径 |
| `.android-sdk/` | 可选的本地 SDK 目录 |
| `*.apk`、`*.aab` | 打包产物 |
| `.idea/` | IDE 配置 |

## 应用图标

源文件：`app/src/main/ic_launcher_source.png`  
已生成各密度 `mipmap-*` 与自适应图标前景 `res/drawable-nodpi/ic_launcher_foreground.png`。

更换图标时替换源文件后重新生成各密度 PNG，或直接用 Android Studio **Image Asset** 工具更新。

## 修改默认地址

编辑 `app/src/main/java/com/scribeai/client/MainActivity.kt`：

```kotlin
private const val HOME_URL = "https://metting.ryledu.cn"
```

## 登录态保持

Web 端使用 `localStorage` 存 JWT；部分机型 WebView 冷启动后 `localStorage` 可能丢失。  
APP 会在页面加载完成后将 token **同步到原生 SharedPreferences**，下次启动再**注入回网页**，与前端 `/`、`/login` 的已登录检测配合使用。

## 说明

- 仅支持 `http://` / `https://` 页面内导航；其他 scheme 不自动跳转外部应用
- 返回键优先 WebView 后退，无历史时退出应用
- 使用 HTTPS，未开启明文 HTTP（`usesCleartextTraffic=false`）
