---
title: Android Interview Questions
layout: post
categories: post
tags:
  - Android
  - Interview
thumbnail: /static/thumbnails/img-01.jpg
---
# Android Interview Questions

900+ questions across Android, Kotlin, Compose, Architecture, DSA, System Design, Behavioral, and Coding Tests.

## Android Platform

### Activity & Fragment Lifecycle

- Walk me through the Activity lifecycle callbacks and what each one is meant for.
- What happens when the user rotates the device?
- What is the difference between onSaveInstanceState and onRestoreInstanceState?
- How does ViewModel survive configuration changes?
- What happens when Activity A starts Activity B? Walk through the callback order.
- What happens during process death? How is it different from a configuration change?
- What's the difference between ViewModel and SavedStateHandle?
- List the Fragment lifecycle callbacks. How do they differ from Activity?
- What is viewLifecycleOwner in a Fragment and why does it matter?
- Why should Fragments only use the default no-argument constructor?
- Why do I call setContentView() only in onCreate?
- Explain onNewIntent. When is it called?
- When does onDestroy get called without onPause and onStop?
- How does multi-window mode affect the lifecycle?
- How does ViewModel scoping work?
- What are lifecycle-aware components?
- Can a Fragment's lifecycle state exceed its host Activity's state?
- What is the Fragment Result API?
- What is setRetainInstance(true) and why is it deprecated?
- What is ProcessLifecycleOwner?
- What's the difference between FragmentTransaction add() and replace()?
- How do you test Activity lifecycle behavior?

### Android Components

- What are the four core Android components?
- What is the Service lifecycle?
- What are the three types of Services in Android?
- What is the difference between `startService()` and `bindService()`?
- Services run on the main thread — what does that mean?
- What does `onStartCommand()` return and what do the return values mean?
- When should you use Service vs WorkManager?
- What are the Foreground Service requirements on modern Android?
- What is the `AndroidManifest.xml` and what must be declared in it?
- What is a Broadcast Receiver and how do you register one?
- What changed with implicit broadcast restrictions in Android 8.0+?
- What is a Content Provider and when would you use one?
- What is `android:exported` and why does it matter?
- Explain Application Context vs Activity Context.
- What is the Binder mechanism and how does IPC work?
- What is AIDL and when would you use it over Messenger?
- What is FileProvider and why is it needed?
- What happened to `LocalBroadcastManager` and what replaced it?
- What is an Intent and what are the types?
- What are PendingIntents and when do you use them?
- What are ordered broadcasts vs normal broadcasts?

### Intents, Launch Modes & Navigation

- What is an Intent in Android?
- What's the difference between explicit and implicit intents?
- What are the four launch modes?
- What is an Intent Filter and how does the system match them?
- How do you pass data between Activities using intents?
- Parcelable vs Serializable — when do you use which?
- What is a PendingIntent?
- How do Intent flags interact with manifest launch modes?
- What happens inside onNewIntent()?
- What's the difference between `setData()` and `putExtra()`?
- What are FLAG_IMMUTABLE and FLAG_MUTABLE?
- What is task affinity?
- What is a Sticky Intent? Is it still relevant?
- What is the difference between deep links and App Links?
- Walk through the back stack behavior for each launch mode.
- What happens when you use FLAG_ACTIVITY_CLEAR_TOP with standard launch mode?
- What security concerns exist with implicit intents and PendingIntents?
- What is singleInstancePerTask?
- How do you handle deep links in a single-Activity architecture?
- What is a deferred deep link?
- How does `android:exported` affect intent delivery?
- What's the difference between `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_CLEAR_TASK`?

### Views, RecyclerView & Custom UI

- What is the ViewHolder pattern, and why is it mandatory in RecyclerView?
- Walk through the three key methods of `RecyclerView.Adapter`.
- What are the three phases of the View rendering pipeline?
- What is the difference between `invalidate()` and `requestLayout()`?
- What is `DiffUtil` and why should you use it instead of `notifyDataSetChanged()`?
- What is the difference between `DiffUtil`, `AsyncListDiffer`, and `ListAdapter`?
- Explain how RecyclerView's view recycling mechanism works internally.
- How do you handle multiple view types in RecyclerView?
- What's the difference between RecyclerView and the old ListView?
- What are the three built-in LayoutManagers, and when would you use each?
- What does `onMeasure()` do, and what are the three MeasureSpec modes?
- Explain the touch event dispatch mechanism — `dispatchTouchEvent`, `onInterceptTouchEvent`, and `onTouchEvent`.
- What's the 16ms frame budget, and what happens when you exceed it?
- What is overdraw, and how do you detect and reduce it?
- How do you flatten a view hierarchy and why does it matter?
- What is `RecycledViewPool` and how can you share it between nested RecyclerViews?
- How do you resolve touch conflicts between a parent ScrollView and a child RecyclerView?
- What is `ItemDecoration` and how does it work?
- How does `ItemAnimator` work in RecyclerView?
- When would you create a custom View, and what's the difference between extending `View` vs `ViewGroup`?
- What is `ViewStub` and when would you use it?
- What is `SnapHelper` in RecyclerView and how does it work?
- What is hardware acceleration and what are its limitations?

### Threading & Background Work

- What is the main thread in Android and why can't you block it?
- What is an ANR and how do you diagnose it?
- What are Handler, Looper, and MessageQueue?
- What is WorkManager and when should you use it?
- What is the difference between WorkManager, AlarmManager, and foreground services?
- What are the different types of work requests in WorkManager?
- What is the difference between Worker, CoroutineWorker, and ListenableWorker?
- What happens to WorkManager tasks when the device reboots?
- What is Doze mode and how does it affect background work?
- How did background work restrictions evolve across Android versions?
- What are the foreground service type requirements in Android 14?
- What is HandlerThread and when would you use it?
- What is Expedited Work in WorkManager?
- How would you handle a long-running upload that survives process death?
- How does WorkManager decide which scheduling mechanism to use?
- How does MessageQueue work at the native level?
- What is the difference between a Service and an IntentService?
- How do you prevent duplicate work in WorkManager?
- What are the exact alarm restrictions in Android 12+?
- How do you observe WorkManager progress and status from the UI?
- How do you reduce battery drain from background work?

### Storage & Data Persistence

- What are the main options for persisting data on Android?
- What is SharedPreferences and how does it work internally?
- What is the difference between commit() and apply() in SharedPreferences?
- What are the problems with SharedPreferences that led to DataStore?
- What is Jetpack DataStore and how does it differ from SharedPreferences?
- What is the difference between Preferences DataStore and Proto DataStore?
- How would you choose between SharedPreferences, DataStore, Room, and file storage?
- What are the three main components of Room?
- How does Room enforce main-thread safety?
- How do Room database migrations work?
- What is the @Transaction annotation in Room?
- How do you handle custom types in Room with TypeConverter?
- How do you model relationships in Room?
- What is the difference between internal storage and external storage?
- What is scoped storage?
- How do you share files between apps?
- What is a Content Provider?
- How does EncryptedSharedPreferences work?
- What are database indexes in Room?
- How does Room's compile-time SQL verification work?
- How do you test Room databases?
- What is the Storage Access Framework (SAF)?
- When should you normalize vs denormalize a database schema?
- What is Write-Ahead Logging (WAL) and why does SQLite use it?

### Networking & API Communication

- What is the difference between OkHttp and Retrofit?
- How does a network request flow through OkHttp and Retrofit?
- What are OkHttp interceptors? What's the difference between application and network interceptors?
- How do you handle authentication tokens and token refresh in the network layer?
- What HTTP caching strategies exist, and how does OkHttp handle them?
- What is certificate pinning and why would you use it?
- What is the Network Security Configuration?
- How does Retrofit's suspend function support work under the hood?
- What is the difference between `enqueue()` and `execute()` in OkHttp?
- How does OkHttp's connection pooling work?
- Walk through OkHttp's built-in interceptor chain in order.
- What's the difference between Gson, Moshi, and kotlinx.serialization?
- What is the difference between short polling, long polling, and WebSocket?
- What is the difference between WebSocket and Server-Sent Events (SSE)?
- REST vs GraphQL — when would you choose each on mobile?
- How do you handle network connectivity changes and offline scenarios?
- What is the difference between JSON and Protocol Buffers?
- How would you implement retry with exponential backoff?
- How does Retrofit's converter system work?
- How would you implement request deduplication?
- What is HTTP/2 and why does it matter for mobile?
- What is an unmetered network constraint and how does it affect background work?
- What is the difference between FlatBuffers and JSON? When should you use FlatBuffers?
- What is the difference between Webhook and Polling? When would you choose each?

### Notifications, Permissions & Security

- What are the different types of permissions in Android?
- Walk through the runtime permission request flow. What are the edge cases?
- What are notification channels and why do they matter?
- How does Firebase Cloud Messaging (FCM) work?
- What is the difference between data messages and notification messages in FCM?
- What is the POST_NOTIFICATIONS permission introduced in Android 13?
- What is the Android Keystore and why should you use it?
- What is EncryptedSharedPreferences and when would you use it?
- How would you implement a secure authentication flow in an Android app?
- What security considerations apply when storing and transmitting user data?
- How does certificate pinning protect against man-in-the-middle attacks?
- How does the BiometricPrompt API work on Android?
- What is the difference between OAuth 2.0, JWT, and session-based authentication?
- What are the common WebView security vulnerabilities?
- What is the difference between Keychain and Keystore?
- What are the differences between AES, RSA, and SHA?
- How do notification actions, direct reply, and bundled notifications work?
- How does FCM topic messaging work?
- What is Play Integrity API and when would you use it?
- What is StrongBox and how does it relate to the Keystore?
- What happens when a user revokes a permission while the app is running?
- How does the network security config work in Android?
- How do you securely store API keys in an Android app?
- What is Cleartext traffic in Android and how do you restrict it?
- What is the difference between Hash, Encrypt, and Encode?
- What is the difference between Symmetric and Asymmetric Encryption?
- What is the SMS Retriever API and how does it work?

### Memory Management & Performance

- What is a memory leak in Android?
- How does garbage collection work on Android?
- Why does an Android app lag?
- What are the common causes of `OutOfMemoryError`?
- How do you handle large bitmaps efficiently?
- How would you profile and fix a janky RecyclerView?
- How do you measure and optimize app startup time?
- What is `onTrimMemory()` and how do you respond to it?
- What is overdraw and how do you reduce it?
- What is StrictMode?
- Is it possible to force garbage collection in Android?
- What is LruCache and how does it work?
- What is the difference between `ARGB_8888` and `RGB_565`?
- What is R8 and how does it affect performance?
- What is the difference between ART and Dalvik?
- What are baseline profiles?
- What is `inBitmap` and how does bitmap pooling work?
- How does LeakCanary detect memory leaks?
- What is Macrobenchmark and how does it differ from Microbenchmark?
- How does hardware acceleration affect rendering?
- How would you reduce APK size?
- What is the difference between `HashMap`, `ArrayMap`, and `SparseArray`? When should you use each?
- How do you use Memory Heap Dumps to diagnose memory issues?

### Gradle & Build System

- What is the difference between `implementation`, `api`, and `compileOnly` dependency configurations?
- What are the three phases of a Gradle build?
- What are build types and product flavors, and how do they combine?
- What is the difference between `build.gradle.kts` at the project level vs the module level?
- How does the Android build process work from source code to APK?
- What is the difference between APK and Android App Bundle (AAB)?
- What is the Gradle wrapper and why should you use it?
- What is the difference between KSP and KAPT?
- How does signing work in Android?
- What are version catalogs and why are they used?
- What is `buildConfigField` and how does it differ from `resValue`?
- What is Multidex and why was it needed?
- What is the Gradle daemon and how does it speed up builds?
- What are the main strategies for reducing build time in a large Android project?
- How does Gradle's build cache work?
- What is the Configuration Cache and how does it differ from the Build Cache?
- What are convention plugins and why are they better than `buildSrc`?
- What is R8 and how does it differ from ProGuard?
- How would you set up a CI/CD pipeline for an Android project?
- How do you handle dependency conflicts in Gradle?
- What is `settings.gradle.kts` and what does `dependencyResolutionManagement` do?
- What is the difference between `includeBuild` and `include` in settings?
- What is desugaring in Android and why is it needed?
- What is the difference between annotationProcessor, KAPT, and KSP?
- What is a Build Variant in Android?

### Android Internals & Process Management

- What is ART and how does it differ from Dalvik?
- What is the difference between cold start, warm start, and hot start?
- What is the app startup sequence from tap to first frame?
- What is an ANR and what are the thresholds?
- What are the most common causes of ANRs?
- What is the Zygote process?
- What is the Application class and when is it initialized?
- What is the process importance hierarchy?
- How does Android handle process death and restoration?
- What is Binder IPC?
- What is a DEX file?
- What is Multidex and why is it needed?
- How does `ContentProvider` initialization affect app startup?
- What is AIDL and how is it different from Messenger?
- What is the Low Memory Killer?
- What is the `oom_adj_score` and how is it assigned?
- What is ActivityThread and what role does it play?
- What happens internally when you call `startActivity()`?
- How does Zygote preloading work under the hood?
- What is the Binder thread pool and what happens when it's exhausted?
- What is profile-guided optimization in ART?
- What is `android:process` and what are the implications of using a separate process?
- How does the DEX file layout affect startup performance?
- What is the 16 KB page size change in Android 15?

### App Links, Deep Links & Navigation

- What is a deep link in Android?
- What are the three types of deep links on Android?
- What is the difference between a deep link and an App Link?
- How do you set up a basic deep link intent filter?
- How do you read data from an incoming deep link?
- What is the Digital Asset Links file and where does it go?
- How do you configure an App Link in the manifest?
- What changed with deep link behavior on Android 12?
- How does Android verify App Links at install time?
- What happens when App Link verification fails?
- What happens when multiple `` elements are in the same intent filter?
- What is the difference between `pathPrefix`, `path`, and `pathPattern`?
- What is a custom URI scheme and what are its limitations?
- How do you test deep links during development?
- How do deep links work with the Navigation component?
- What is the difference between explicit and implicit deep links in the Navigation component?
- How does deep link handling differ in Compose navigation?
- How do you handle deep links that require authentication?
- What are deferred deep links and how do they work?
- How do you handle deep links in multi-module navigation?
- What is `DomainVerificationManager` and when would you use it?
- How do you support deep links across product flavors with different package names?

### Sensors, Camera & Hardware APIs

- What is CameraX and how does it differ from Camera2?
- How do you set up a camera preview using CameraX?
- What location permissions does Android require?
- What is the Fused Location Provider and why use it over raw GPS?
- How does the BiometricPrompt API work?
- What are the three categories of sensors in Android?
- How do you access sensor data in Android?
- What is the difference between the accelerometer and the gyroscope?
- What is the difference between Bluetooth Classic and BLE?
- How does Android handle location in the background?
- What is geofencing in Android?
- What is the CameraX ImageAnalysis use case?
- What is the difference between MediaPlayer and ExoPlayer?
- How would you implement a step counter?
- How does the sensor sampling rate work?
- What is NFC and how is it used in Android?
- How do you handle BLE communication — scanning, connecting, and reading data?
- What is the proximity sensor used for?
- How do you filter noisy sensor data?
- What are the Camera2 API's core concepts?
- How do you check if a sensor is available before using it?
- What permissions are needed for Bluetooth on modern Android?
- What is the ACTIVITY_RECOGNITION permission?

### Accessibility & Localization

- What is accessibility in Android and why does it matter?
- What is contentDescription and when should I use it?
- What are content description best practices?
- What is TalkBack and how does it work?
- What is the minimum touch target size recommended by Android?
- What is the difference between importantForAccessibility and contentDescription = null?
- What is color contrast ratio and how does it affect accessibility?
- How do I handle localization using string resources?
- What is RTL support and how do I implement it?
- How do I handle plurals in string resources?
- How do I handle formatting differences across locales?
- What is the difference between a crash and an ANR, and how do I debug each?
- What are Android vitals?
- What is StrictMode and how does it help with app quality?
- How do I test accessibility on Android?
- How do semantics work in Jetpack Compose for accessibility?
- How do I merge and clear semantics in Compose?
- What are live regions and custom accessibility actions?
- How does per-app language selection work?
- How does crash reporting work under the hood?
- What are app quality guidelines and how do they differ from core vitals?
- What is AccessibilityDelegate and when would I use it?
- How do I handle dynamic text sizing for accessibility?

## Kotlin

### Basics & Type System

- What is the difference between val and var?
- How does null safety work in Kotlin?
- What is the difference between == and === in Kotlin?
- What are smart casts in Kotlin?
- What is the difference between as and as? for casting?
- Explain Kotlin's type hierarchy — Any, Unit, and Nothing.
- What is the difference between Any and Any? in the type hierarchy?
- What is a data class and what methods does it generate?
- How do copy() and componentN() work in data classes?
- What is the difference between sealed class and enum class?
- What is the difference between sealed class and sealed interface?
- What is a value class and when would you use it?
- Explain the object keyword — singleton, companion object, and anonymous object.
- What is the difference between lateinit and lazy?
- How does lateinit work under the hood?
- What is const val and how is it different from val?
- What is the difference between companion object and top-level functions?
- What is a typealias and how is it different from a value class?
- What is the String Pool on the JVM and how does it affect Kotlin string comparisons?
- What are Labels in Kotlin? How do you use break@label, continue@label, and return@label?
- What are property delegates in Kotlin? Explain Delegates.observable, Delegates.vetoable, and Delegates.notNull.

### Functions & Scope Functions

- What is a higher-order function?
- What is a lambda expression? What does `it` mean?
- What is the difference between a lambda and an anonymous function?
- What are the five scope functions and how do they differ?
- When should you use let vs apply vs also?
- What is the difference between run and with?
- What is an extension function?
- How are extension functions resolved — statically or dynamically?
- Can you write an extension function on a nullable type?
- What is an infix function?
- What is an inline function and why does it matter for performance?
- What is a reified type parameter and why does it require inline?
- What is non-local return in inline functions?
- What are crossinline and noinline?
- What is the tailrec modifier?
- What is a function reference and when is it better than a lambda?
- What is the difference between T.() -> Unit and (T) -> Unit as a function type?
- How do scope functions behave with nullable receivers?
- When should you NOT use inline functions?
- What happens under the hood when you pass a lambda to a non-inline higher-order function?

### Collections, Sequences & Functional Patterns

- What is the difference between List and MutableList in Kotlin?
- What does map do, and how is it different from flatMap?
- What is the difference between fold and reduce?
- Explain groupBy and associateBy. When do you use each?
- What do partition, chunked, and windowed do?
- What is destructuring in Kotlin and how does it work?
- What is operator overloading in Kotlin?
- What is the by keyword in Kotlin? What are property delegates?
- Explain Sequence vs Iterable. When does using a Sequence matter?
- What are intermediate and terminal operations on a Sequence?
- What is the difference between Sequence and Flow?
- How does lazy delegation work internally?
- How do observable and vetoable delegates work?
- How do you write a custom property delegate?
- Explain class delegation with the by keyword.
- How does the order of collection operations affect performance?
- How do you transform a Map using Kotlin's collection functions?
- What does buildList do and why is it useful?
- What is the difference between associate, associateBy, and associateWith?

### Generics, Variance & Reified Types

- What are generics in Kotlin and why do we need them?
- What is type erasure and how does it affect generics?
- What does covariance mean? Explain the out keyword.
- What does contravariance mean? Explain the in keyword.
- What is the PECS principle and how does it apply in Kotlin?
- How does variance work with MutableList vs List?
- What is the difference between star projection and a generic type?
- What are generic constraints and the where clause?
- What is the difference between declaration-site and use-site variance?
- What is the reified keyword and why does it require inline?
- Can you use reified with classes?
- How does Nothing type work in generics?
- What are the differences between Class, KClass, and reified T?
- Explain type projection with a real example.
- What happens when you combine multiple generic constraints with variance?

### Kotlin Under the Hood

- How does Kotlin compile to JVM bytecode?
- What happens to a data class at the bytecode level?
- How does a companion object compile?
- What does @JvmStatic actually do?
- What does @JvmField do?
- What is @JvmOverloads and when is it needed?
- How does Kotlin's null safety work at the bytecode level?
- How does a sealed class compile?
- What is the difference between sealed class and sealed interface at the bytecode level?
- How does the suspend function CPS transformation work?
- How does the compiler turn a suspend function into a state machine?
- How do inline functions work at the bytecode level?
- How does a lambda compile to bytecode?
- What is SAM conversion and how does it work?
- How does the when expression compile?
- How does the delegation pattern compile?
- How do inline value classes work at the bytecode level?
- How does property delegation compile?
- What is @JvmName and when would you use it?
- How does a coroutine suspension point differ from a regular function call in bytecode?

### Contracts, DSLs & Advanced Patterns

- What is the Result type in Kotlin?
- How do sealed classes help with error handling?
- How does Result compare to sealed classes for error handling?
- What is class delegation and how does it differ from inheritance?
- What is interface delegation and the Decorator pattern?
- What is a DSL in Kotlin and what makes it possible?
- What is @DslMarker and why is it important?
- How do you build a type-safe builder?
- What are Kotlin contracts and what problem do they solve?
- What does callsInPlace do in a contract?
- What does returns implies do?
- What are context receivers (context parameters)?
- What are the limitations of Kotlin contracts?
- How do sealed hierarchies work with exhaustive when expressions?
- How does the delegation pattern compare to dependency injection?
- How do scope functions relate to DSL building?
- What are inline value classes and when would you use them?

## Kotlin Coroutines & Flows

### Coroutines Basics

- What are Kotlin Coroutines and why use them over threads?
- What is a suspend function?
- What is a CoroutineScope?
- What is the difference between launch and async?
- What are Dispatchers? Explain each one.
- What is withContext and when do you use it?
- What is structured concurrency?
- What is a Job and what are its lifecycle states?
- What is the difference between join and cancel on a Job?
- What is SupervisorJob and how is it different from a regular Job?
- What is the difference between coroutineScope and supervisorScope?
- What is CoroutineContext and what does it contain?
- What is runBlocking and when should you use it?
- How does viewModelScope work internally?
- What is Dispatchers.Main.immediate and how is it different from Dispatchers.Main?
- What is the difference between GlobalScope and a custom CoroutineScope?
- How do you run two suspend functions in parallel?
- Can you call a suspend function from a regular function?
- How does structured concurrency prevent coroutine leaks?

### Coroutines Advanced

- How does exception handling work in coroutines?
- How do exceptions propagate in a coroutine hierarchy?
- How does coroutine cancellation work? What does "cooperative cancellation" mean?
- What is the difference between ensureActive() and yield()?
- What happens when you cancel a coroutine doing CPU-intensive work with no suspension points?
- What is NonCancellable and when would you use it?
- What is CPS transformation and how does the compiler handle suspend functions?
- How does the compiler generate a state machine for suspend functions?
- What is Mutex and how is it different from synchronized?
- What is Semaphore and how does it differ from Mutex?
- Explain Channel types — Rendezvous, Buffered, Conflated, and Unlimited.
- How does the select expression work?
- What is suspendCoroutine and when do you use it?
- What is suspendCancellableCoroutine and how does it differ?
- How do you convert a multi-shot callback API into a Flow?
- How does withContext actually switch threads?
- What is the difference between coroutineScope and supervisorScope for exception handling?

### Cold Flows & Operators

- What is a Flow and why is it called "cold"?
- What are the different ways to create a Flow?
- What are terminal operators?
- What are intermediate operators? How do map, filter, and transform work?
- How do take, zip, combine, and merge differ?
- What does flowOn do and why is it important?
- What is onStart and onCompletion?
- How does the catch operator work?
- How do retry and retryWhen work?
- What is the difference between buffer and conflate?
- What are the buffer overflow strategies?
- How does debounce work?
- What does distinctUntilChanged do?
- Explain flatMapConcat, flatMapMerge, and flatMapLatest.
- What happens if you throw an exception inside the collect block?
- What is the execution order when chaining flow operators?

### Hot Flows, StateFlow & SharedFlow

- What is the difference between a cold flow and a hot flow?
- What is StateFlow and how does it differ from SharedFlow?
- What are MutableSharedFlow and MutableStateFlow?
- When would you use SharedFlow instead of StateFlow?
- What does the replay parameter in SharedFlow do?
- What is callbackFlow?
- What is channelFlow and how does it differ from callbackFlow?
- What are the SharingStarted strategies?
- What is the difference between stateIn and shareIn?
- How do you safely collect flows in an Activity or Fragment?
- What is flowWithLifecycle?
- What is collectAsStateWithLifecycle in Compose?
- How does SharedFlow handle backpressure?
- How does WhileSubscribed(5_000) survive configuration changes?
- How do you handle one-shot events like navigation using flows?
- What is the difference between conflate() and collectLatest?
- What converts a cold flow to hot when using stateIn inside a ViewModel?
- What is the subscriptionCount property on SharedFlow?
- Can you create a custom SharingStarted strategy?

## Jetpack Compose

### Fundamentals & Thinking in Compose

- What is Jetpack Compose?
- What is a @Composable function?
- What is the difference between declarative and imperative UI?
- How does Compose differ from the XML View system?
- What does "composition over inheritance" mean in Compose?
- What is Composition in Compose?
- What is recomposition?
- What happens during initial composition vs recomposition?
- What are the three phases of Compose?
- What is @Preview and how does it work?
- What is the difference between remember and mutableStateOf?
- How does remember work internally?
- Why does Compose use functions instead of classes for UI components?
- What is the role of the Compose compiler plugin?
- What is the difference between Compose Runtime and Compose UI?
- How does Compose decide to skip a composable during recomposition?
- What is positional memoization?
- What is the slot table?
- How does the Compose compiler transform @Composable functions at bytecode level?
- Can composable functions run in parallel?

### State Management

- What is state in Jetpack Compose?
- How do you retain data in composable functions?
- What is mutableStateOf and how does it work?
- What is the difference between remember and rememberSaveable?
- How do you save custom objects with rememberSaveable?
- What is state hoisting in Compose?
- What is unidirectional data flow (UDF) in Compose?
- What are mutableStateListOf and mutableStateMapOf?
- What is derivedStateOf and when should you use it?
- How does derivedStateOf differ from computing a value in the composable body?
- What is snapshotFlow and when do you use it?
- What is the difference between collectAsStateWithLifecycle and collectAsState?
- When should you use a ViewModel vs a state holder class?
- How should you structure state in a ViewModel for Compose?
- What is the difference between using State vs StateFlow in a ViewModel?
- How does state restoration work after process death?
- How does the snapshot system work under the hood?
- What is the right way to expose one-time events from ViewModel to UI?
- How do you handle text field state efficiently in Compose?
- What happens if you forget to wrap mutableStateOf with remember?
- What happens to remember state when a composable leaves and re-enters the composition?
- What is StateFlow and how does it differ from LiveData?
- What is the difference between UI state and data state?
- What is SharedFlow and when do you use it instead of StateFlow?
- What is the single state object pattern?
- What is SavedStateHandle and why do you need it?
- How does process death differ from configuration changes?
- How does stateIn work and what is the right SharingStarted strategy?
- When should you use multiple flows instead of a single state object?
- How does Redux-style state management (MVI) work in Android?
- What is a state machine and how do you implement one in Android?
- How does the Compose snapshot system relate to state management?
- How do you handle state restoration after process death in Compose?
- What is unidirectional data flow and why does it matter for state management?

### Side Effects & Lifecycle

- What is a side effect in Compose?
- What is the Compose lifecycle?
- What is LaunchedEffect and when do you use it?
- What is DisposableEffect and how is it different from LaunchedEffect?
- What is SideEffect and when do you use it?
- What is the difference between rememberCoroutineScope and LaunchedEffect?
- What is rememberUpdatedState and why is it needed?
- What is the difference between LaunchedEffect(Unit) and LaunchedEffect(true)?
- What is produceState?
- What is snapshotFlow?
- How does the Compose lifecycle relate to the Activity lifecycle?
- How do you handle one-time events like navigation and snackbars?
- How does Compose handle effects during configuration changes?
- What is the key() composable and when do you need it?
- How do multiple LaunchedEffects work in the same composable?
- What happens when you call effects conditionally?
- How does process death affect Compose state?
- What is movableContentOf and how does it interact with lifecycle?
- What is the difference between collectAsState and collectAsStateWithLifecycle?
- What is the order of execution between SideEffect, LaunchedEffect, and DisposableEffect?
- How do you handle back press events in Compose?

### Recomposition, Stability & Performance

- What triggers recomposition?
- What is smart recomposition?
- What is the stability system in Compose?
- What is the difference between @Stable and @Immutable?
- Why are collections like List<> considered unstable by default?
- How does Compose handle interfaces for stability?
- Why should I use viewModel::onClick instead of { viewModel.onClick() } in composables?
- How does Compose compare parameters to decide whether to skip recomposition?
- What is donut-hole skipping?
- What is strong skipping mode?
- What are the common performance mistakes with recomposition?
- How does the Compose runtime handle recomposition scheduling?
- How do I use graphicsLayer for performance?
- What is the slot table and how does Compose use it?
- How do I use the Compose compiler reports to diagnose stability issues?
- How do I debug recomposition issues in a running app?
- What is the stability configuration file?
- What is movableContentOf?
- How does derivedStateOf help reduce unnecessary recompositions?

### Layouts, Modifiers & Custom Drawing

- What is the difference between Row, Column, and Box?
- How does the weight modifier work in Row and Column?
- Why does modifier order matter in Compose?
- What happens when you apply size modifiers in different positions in the chain?
- What is the difference between offset and padding?
- What are the three phases of Compose rendering?
- How does clip work in Compose?
- How do you create a custom shape for clipping?
- What is graphicsLayer and when would you use it?
- What are the three main drawing modifiers in Compose?
- What is Canvas in Compose and how is it different from Android's Canvas?
- What is Brush in Compose?
- How does the modifier chain work internally?
- How does the Layout composable work?
- What is the difference between the layout modifier and the Layout composable?
- What is the difference between Modifier.layout and Modifier.offset for positioning?
- What are intrinsic measurements and when are they needed?
- What is SubcomposeLayout and how does LazyColumn use it?
- How do alignment lines work in custom layouts?
- What is CompositingStrategy in graphicsLayer?
- What are Window Size Classes and how do you build adaptive layouts?
- How does ConstraintLayout work in Compose?

### Animation APIs

- What is animate*AsState and when do you use it?
- How does AnimatedVisibility work?
- What is the difference between AnimatedContent and Crossfade?
- What does animateContentSize do?
- What is the difference between spring, tween, and keyframes animation specs?
- What is rememberInfiniteTransition and when do you use it?
- How do you use updateTransition for coordinated animations?
- What is Animatable and how is it different from animate*AsState?
- How do you create sequential and concurrent animations?
- How does Compose handle interrupted animations?
- What happens to animations during recomposition? How do you prevent resets?
- When should you use graphicsLayer for animations instead of regular modifiers?
- How do you animate items in a LazyColumn?
- What are shared element transitions in Compose?
- How do you build gesture-driven animations?
- What is the difference between animateDecay and animateTo?
- How would you implement a shimmer loading effect?
- How do you animate navigation transitions in Compose?
- How does Compose's animation system compare to the View system?

### Navigation, Theming & Architecture

- What are the core components of Navigation Compose?
- How does type-safe navigation work in Navigation Compose?
- How do you pass arguments between navigation destinations?
- What is popUpTo and how does back stack management work?
- What is Material3 theming in Compose?
- How do you handle dark theme and light theme switching?
- How does dynamic color work in Material3?
- What is CompositionLocal and when should you use it?
- What is the difference between compositionLocalOf and staticCompositionLocalOf?
- How do you create and provide a custom CompositionLocal?
- How do you handle navigation events and avoid duplicate navigation?
- How do you implement bottom navigation with Navigation Compose?
- How do you handle deep links in Navigation Compose?
- How does nested navigation work and when should you use it?
- How does NavBackStackEntry manage lifecycle and ViewModel scoping?
- How do you scope a ViewModel to a navigation graph instead of a single destination?
- How does MaterialTheme work internally with CompositionLocal?
- How would you implement a custom theming system beyond MaterialTheme?
- What are the tradeoffs of ViewModel vs the Presenter pattern?
- What is Navigation 3 and how is it different from Navigation Compose?

### Testing & Accessibility

- What is ComposeTestRule and how do you set up a Compose UI test?
- What is the difference between createComposeRule and createAndroidComposeRule?
- How do node finders work in Compose tests?
- What are the most common assertions and actions in Compose tests?
- What is the semantic tree and why does it matter for testing?
- What is Modifier.testTag and when should you use it?
- How do you handle scrolling in Compose tests?
- How do you handle async operations in Compose tests?
- How do you test composables that depend on a ViewModel?
- What are common testing pitfalls in Compose?
- How do you test navigation in Compose?
- How do you set up Compose testing with Hilt?
- What are semantics in Compose and how do they support accessibility?
- How do you set contentDescription correctly in Compose?
- What are the merged and unmerged semantic trees?
- What are semantic roles and when do you set them?
- How do you control traversal order for accessibility?
- What are live regions in Compose accessibility?
- How do you test accessibility properties in Compose tests?
- What is screenshot testing and how does Paparazzi work for Compose?
- How does Compose Preview testing work?

## Architecture & Design

### Clean Architecture & SOLID Principles

- What is Clean Architecture?
- What are the three main layers in Clean Architecture for Android?
- What are the SOLID principles?
- What is the Single Responsibility Principle in practice?
- What is the dependency rule?
- What is a Use Case?
- What is the Repository pattern in Clean Architecture?
- What is the difference between domain models, DTOs, and entities?
- What is the Dependency Inversion Principle and how does it relate to Clean Architecture?
- What is the difference between Clean Architecture and MVVM?
- What is the Interface Segregation Principle in practice?
- Is the domain layer always necessary?
- How do you structure packages in Clean Architecture?
- What is the mapper pattern and why does Clean Architecture use it?
- How do you handle errors across layers in Clean Architecture?
- How do SOLID principles apply to a real ViewModel?
- How do you handle data shared across multiple screens?
- What is the Open-Closed Principle in practice?
- What is the Liskov Substitution Principle violation in Android?

### MVVM, MVI & Architecture Patterns

- What is MVVM?
- What is a ViewModel and why does it survive configuration changes?
- What is the difference between LiveData and StateFlow for UI state?
- What is MVI?
- What is the difference between MVVM and MVI?
- What is unidirectional data flow?
- What is MVC and how does it work in Android?
- What is MVP and how is it different from MVC?
- What is the Repository pattern?
- What is the SingleLiveEvent problem?
- What is separation of concerns and how do architecture patterns enforce it?
- How does the ViewModel communicate with the View in different patterns?
- What is a reducer in MVI?
- How do you handle side effects in MVI?
- When would you choose MVI over MVVM?
- How do you test a ViewModel?
- What are common mistakes when implementing MVVM?
- What is the role of the domain layer in Clean Architecture?

### Dependency Injection — Hilt, Dagger, Koin

- What is Dependency Injection and why do I need it?
- What is the difference between Service Locator and Dependency Injection?
- What is Dagger 2 and how does it work?
- What is Hilt and how is it different from Dagger?
- What is the difference between @Provides and @Binds?
- What are the main Hilt annotations?
- What are Hilt components and their scopes?
- What is Koin and how does it work?
- What is the difference between compile-time and runtime DI?
- How does scoping work and what happens if I get it wrong?
- How does Hilt handle ViewModel injection internally?
- What is @EntryPoint and when do I need it?
- What is AssistedInject and when do I use it?
- How do I test with Hilt?
- What are Dagger Components and Subcomponents?
- How do I do manual DI without a framework?
- How does DI work in a multi-module project?

### Modularization & Multi-Module

- What is modularization and why do I modularize?
- What are the common types of modules?
- What is the difference between feature-based and layer-based modularization?
- What does the dependency graph look like?
- What is the difference between api and implementation in Gradle?
- How do I handle navigation between feature modules?
- How do I avoid circular dependencies?
- What are the build time benefits?
- How does Hilt work across modules?
- What are Gradle convention plugins?
- How do I enforce module boundaries?
- How do I share data across feature modules?
- How do I decide the right granularity?
- What are dynamic feature modules?
- How do I structure shared resources?
- What is the impact on testing?
- How do I migrate a monolithic app to multi-module?

### Design Patterns in Android

- What is the Observer pattern and how does Android use it?
- What is the Singleton pattern and how is it used in Android?
- What is the Builder pattern and where do you see it in Android?
- What is the Factory pattern?
- What is the Repository pattern and why is it central to Android architecture?
- What is the Strategy pattern?
- What is the Adapter pattern?
- What is the Decorator pattern?
- What is the Facade pattern?
- What is the Command pattern and where does Android use it?
- How does the Observer pattern differ between LiveData and Flow?
- How does the Android SDK use design patterns internally?
- When should you prefer composition over inheritance to apply design patterns?
- How do you decide which design pattern to use in a real Android project?
- What is the difference between the Template Method pattern and Strategy pattern?

### Error Handling & Resilience

- How do you model errors using sealed classes?
- What is the difference between exceptions and errors in Kotlin?
- What is Kotlin's built-in Result type?
- How does try-catch work with coroutines?
- What is CoroutineExceptionHandler?
- How do you handle errors in Flow chains?
- How do you design error states in a ViewModel using UDF?
- How do you map network errors to user-facing messages?
- How do you handle timeout in coroutines?
- What is the difference between Result type and sealed class error modeling?
- What is exponential backoff and when do you use it?
- What is the circuit breaker pattern?
- How do you implement graceful degradation in an Android app?
- How do you handle global error handling and crash reporting?

### Testing Strategy & Testable Code

- What is the test pyramid and why does it matter?
- What makes code testable?
- What are the different types of test doubles?
- How do you write unit tests with JUnit and MockK?
- What is the difference between Mockito and MockK?
- What is the role of dependency injection in writing testable code?
- How do you test coroutines with TestDispatcher?
- How do you test a ViewModel that uses SavedStateHandle?
- How do you test Flows?
- How do you test Compose UI?
- How does Robolectric work and when should you use it?
- What is Espresso and how does it differ from Compose testing?
- How do you structure tests for a Clean Architecture app?
- How do you handle flaky tests?
- What is code coverage and how much should you aim for?

## Android Libraries

### Networking — OkHttp & Retrofit

- What is an OkHttp Interceptor? What is the difference between an application interceptor and a network interceptor?
- How does HTTP caching work in OkHttp?
- How do you enable logging in OkHttp?
- What is connection pooling and how does OkHttp manage it?
- How does Retrofit integrate with Kotlin Coroutines and Flow?
- What is a Multipart request and how do you implement it with Retrofit?
- How does Retrofit's converter system work? How do you add custom converters?
- How would you implement retry logic with OkHttp?

### Image Loading — Glide & Coil

- How does an image loading library like Glide or Coil work internally?
- What is a Bitmap Pool and how does it improve performance?
- What is the difference between Glide and Coil?
- How does Coil integrate with Jetpack Compose?
- What caching layers does Glide/Coil use (memory cache, disk cache)?
- How do you handle image loading in a RecyclerView with large lists?
- How do you load images with custom transformations (rounded corners, blur)?
- What design patterns does Glide use internally?

### Dependency Injection — Hilt & Dagger

- What is the difference between Dagger 2 and Hilt?
- How do @Inject, @Module, @Provides, @Component, and @Singleton work in Dagger?
- What are custom scopes in Dagger and when do you need them?
- How does Hilt simplify ViewModel injection compared to Dagger?
- What is the difference between @ActivityRetainedScoped and @ViewModelScoped in Hilt?
- How does Hilt handle multi-module projects?
- What are @EntryPoint and @InstallIn and when do you use them?
- How would you migrate from Dagger to Hilt?

### RxJava

- What is RxJava and how does it differ from Kotlin Coroutines?
- What is the difference between Observable, Single, Completable, Maybe, and Flowable?
- What is the difference between map and flatMap in RxJava?
- What are Subjects in RxJava? Explain PublishSubject, BehaviorSubject, and ReplaySubject.
- What are Schedulers in RxJava? What is the difference between Schedulers.io() and Schedulers.computation()?
- What is CompositeDisposable and when should you call dispose() vs clear()?
- How do you handle errors in RxJava?
- How do you make two parallel network calls using RxJava Zip operator?
- What is the difference between Concat and Merge operators?
- When would you still use RxJava over Kotlin Coroutines in a modern Android project?

### Firebase

- How does Firebase Cloud Messaging (FCM) work end-to-end?
- What is Firebase Remote Config and how do you use it for feature flags?
- How does Firebase Crashlytics capture and report crashes?
- What is Firebase App Distribution and when is it used?


## Java

### SOLID Principles

- What is the Single Responsibility Principle (SRP) and how does it apply to Android?
- What is the Open/Closed Principle (OCP)? Give an Android example.
- What is the Liskov Substitution Principle (LSP) and where can it be violated?
- What is the Interface Segregation Principle (ISP) and why does it matter?
- What is the Dependency Inversion Principle (DIP)? How does it relate to Dependency Injection?

### OOP Concepts

- Explain the four pillars of OOP: Encapsulation, Abstraction, Inheritance, Polymorphism.
- What is the difference between an abstract class and an interface?
- What is the difference between method overloading and method overriding?
- What are the four access modifiers in Java? What does each one allow?
- Can an interface implement another interface?
- What is Polymorphism and how is it achieved in Java?
- What is the difference between compile-time (static) and runtime (dynamic) polymorphism?
- Explain the concept of String Pool in Java.
- What is Serialization and Deserialization? How do you implement it?

### Collections & Generics

- What is the difference between Array and ArrayList?
- What is the difference between HashSet and TreeSet?
- What is the difference between HashMap and HashSet?
- What is the difference between HashMap, LinkedHashMap, and TreeMap?
- Explain Generics in Java. What is the difference between `<T>`, `<? extends T>`, and `<? super T>`?
- What is the difference between fail-fast and fail-safe iterators?
- What is `ConcurrentModificationException` and how do you avoid it?
- What is the difference between Collections.synchronizedList and CopyOnWriteArrayList?

### Objects & Primitives

- How is `String` implemented in Java? Why is it immutable?
- What is the difference between String, StringBuffer, and StringBuilder?
- What are the 8 primitive types in Java?
- What is the difference between `int` and `Integer`? What is autoboxing?
- Do objects get passed by value or by reference in Java?
- What is the contract between `equals()` and `hashCode()`?
- What is a Shallow Copy vs a Deep Copy?
- What is the `transient` modifier used for?
- What are anonymous classes?
- When would you make a field `final`?

### Memory Model & Garbage Collector

- How does the Java Garbage Collector work?
- What are the different types of references in Java — Strong, Soft, Weak, and Phantom?
- What is a memory leak in Java and how can it happen?
- What is the difference between the Stack and Heap memory in Java?
- What is the PermGen/Metaspace area?

### Concurrency

- What does the `synchronized` keyword mean in Java?
- What is the difference between Object-Level Lock and Class-Level Lock?
- What is the `volatile` keyword and when do you use it?
- What is a ThreadPoolExecutor? What are its key parameters?
- What is the difference between Concurrency and Parallelism?
- What methods does the atomic package expose (get, set, compareAndSet, etc.)?
- What is a deadlock? How do you prevent it?
- What is the difference between `wait()`, `notify()`, and `notifyAll()`?

### Exceptions

- How do `try`, `catch`, and `finally` work? Does `finally` always run?
- What is the difference between a Checked and an Unchecked Exception?
- What is the difference between `throw` and `throws`?
- What is a StackOverflowError and when does it occur?

### Other Java Topics

- What does the `static` keyword mean for variables, methods, and blocks?
- Can a `static` method be overridden?
- When is a `static` block executed?
- What is the difference between `==` and `.equals()` on objects?
- What are `final`, `finally`, and `finalize`?
- What is Reflection in Java and when would you use it?
- What is Dependency Injection and how does it differ from the Service Locator pattern?
- What is the difference between Serializable and Parcelable?


## Data Structures & Algorithms

### Arrays, Strings & Hash Maps

- Given an unsorted array, find two numbers that add up to a target (Two Sum).
- What is the two-pointer technique and when do you use it?
- Find the longest substring without repeating characters.
- Explain Kadane's algorithm for maximum subarray sum.
- How do you check if two strings are anagrams?
- How do you compute product of array except self without using division?
- What is the sliding window technique?
- How do you group anagrams from a list of strings?
- How do you find the first non-repeating character in a string?
- How do you check if a string is a palindrome?
- How do you find the container with most water?
- How do you find the longest palindromic substring?
- Explain the "subarray sum equals k" problem.
- How do you merge two sorted arrays into one sorted array?
- How do you rotate an array by k positions to the right?
- How do you find the minimum window substring containing all characters of a target?
- How do you solve the 3Sum problem?
- What's the difference between HashMap and HashSet, and when do you use each?
- What is a prefix sum and when is it useful?
- How do you find all anagrams of a pattern in a string?

### Linked Lists

- How do you reverse a singly linked list?
- How do you detect a cycle in a linked list?
- How do you merge two sorted linked lists?
- How do you find the middle element of a linked list?
- What is a linked list and how does it differ from an array?
- How do you remove the nth node from the end of a linked list?
- How do you find the starting node of a cycle in a linked list?
- How do you check if a linked list is a palindrome?
- How do you add two numbers represented as linked lists?
- How do you find the intersection point of two linked lists?
- What's the difference between singly and doubly linked lists?
- Explain how an LRU Cache works using a doubly linked list and HashMap.
- How do you deep copy a linked list with random pointers?
- How do you reverse nodes in k-group?
- How do you sort a linked list in O(n log n) time?

### Stacks & Queues

- How do you check if a string of parentheses is valid?
- How do you design a Min Stack that supports getMin in O(1)?
- What is a monotonic stack and how does it solve "next greater element"?
- How do you find the largest rectangle in a histogram?
- What is a stack and what are its core operations?
- What is a queue and how does it differ from a stack?
- How do you solve Daily Temperatures using a monotonic stack?
- How do you evaluate a Reverse Polish Notation expression?
- How do you implement a queue using two stacks?
- How do you solve the Sliding Window Maximum problem?
- What is a deque and when would you use one?
- What is a priority queue and how does it differ from a regular queue?
- How do you find the Kth largest element using a min-heap?
- How do you merge K sorted lists using a priority queue?
- When would you choose a stack over a queue?

### Trees & Binary Search Trees

- What is the maximum depth of a binary tree and how do you find it?
- How do you invert a binary tree?
- How do you validate whether a binary tree is a valid BST?
- How do you find the lowest common ancestor (LCA) of two nodes in a binary tree?
- How do you perform a level-order traversal (BFS) of a binary tree?
- Explain the four standard tree traversals.
- How do you find the diameter of a binary tree?
- How do you serialize and deserialize a binary tree?
- What is a binary tree and how is it represented?
- How do you delete a node from a BST?
- How do you find the LCA in a BST specifically?
- How do you construct a binary tree from in-order and pre-order traversals?
- How do you check if a binary tree is symmetric?
- How do you check if a binary tree has a path with a given sum?
- What is a balanced binary tree and how do AVL trees maintain balance?
- How do you find all root-to-leaf paths?

### Tries & Advanced Trees

- What is a Trie and why use it over a HashMap for prefix-based lookups?
- How do you implement insert and search in a Trie?
- How does startsWith differ from search in a Trie?
- How do you solve Word Search II (finding multiple words in a grid)?
- How would you implement autocomplete using a Trie?
- How do you delete a word from a Trie?
- What is the space optimization for Tries when the alphabet is large?
- What is a Segment Tree and what problem does it solve?
- How do you implement a Segment Tree for range sum queries?
- What is a Fenwick Tree and how does it compare to a Segment Tree?
- What is an N-ary tree and how does traversal differ?
- What is lazy propagation in a Segment Tree?
- How would you count the number of distinct words in a Trie?

### Graphs: BFS, DFS & Traversals

- How do you solve the Number of Islands problem?
- How does BFS work and when do you use it?
- How does DFS work and when do you use it?
- How do you solve the Course Schedule problem?
- What is the difference between BFS and DFS?
- What is topological sort and when is it used?
- How do you implement topological sort using Kahn's algorithm?
- How do you detect a cycle in a directed graph?
- How do you detect a cycle in an undirected graph?
- What are the main ways to represent a graph?
- How do you solve the Word Ladder problem?
- How do you clone a graph?
- How do you check if a graph is bipartite?
- How do you find connected components in an undirected graph?

### Graphs: Shortest Path & Advanced

- What is Dijkstra's algorithm and when do you use it?
- Why does Dijkstra fail with negative edge weights?
- What is Union-Find (Disjoint Set Union)?
- How do you solve Cheapest Flights Within K Stops?
- What is the Bellman-Ford algorithm?
- How do you decide which shortest path algorithm to use?
- What is a Minimum Spanning Tree?
- Explain Kruskal's algorithm and how it uses Union-Find.
- Explain Prim's algorithm for MST.
- How do you solve the Network Delay Time problem?
- What are common problems where Union-Find is the right tool?
- What is the Floyd-Warshall algorithm?
- When would you use Prim's vs Kruskal's?
- How do you find the shortest path with 0 and 1 edge weights?
- How do you detect a negative-weight cycle?

### Heaps, Priority Queues & Intervals

- How does a binary heap work?
- How do you find the Kth largest element using a heap?
- How do you merge K sorted lists?
- How do you merge overlapping intervals?
- How do you solve Meeting Rooms II (minimum rooms needed)?
- How do you find the median from a data stream?
- How do you insert a new interval into a sorted non-overlapping list?
- What is the difference between a min-heap and a max-heap?
- How do you build a heap from an array and why is it O(n)?
- How do you solve Top K Frequent Elements?
- How do you remove covered intervals?
- What is a non-overlapping interval count problem?
- How do you check if a person can attend all meetings?
- How do you find the Kth smallest element in a sorted matrix?
- What is a heap sort and how does it work?

### Sorting, Searching & Binary Search

- Explain standard binary search and its common pitfalls.
- How do you search in a rotated sorted array?
- Implement merge sort.
- Implement quick sort and explain the partition step.
- What is the time complexity of common sorting algorithms?
- How do you find the peak element in an array?
- What is the Quickselect algorithm for finding the kth largest?
- How do you solve the merge intervals problem?
- What is lower bound and upper bound in binary search?
- How do you find the minimum in a rotated sorted array?
- How does binary search apply beyond sorted arrays?
- What is the difference between comparison-based and non-comparison-based sorting?
- Explain stability in sorting and why it matters.
- How do you solve Meeting Rooms II?
- When should you implement sorting from scratch vs using built-in sort?

### Dynamic Programming Fundamentals

- How do you solve the Climbing Stairs problem?
- How do you solve the Coin Change problem?
- What is dynamic programming and when do you use it?
- What is the difference between memoization and tabulation?
- How do you solve the House Robber problem?
- How do you find the Longest Increasing Subsequence (LIS)?
- How do you solve the 0/1 Knapsack problem?
- How do you solve Edit Distance?
- How do you find the Longest Common Subsequence (LCS)?
- How do you solve Unique Paths on a grid?
- How do you solve the Word Break problem?
- How do you solve the Decode Ways problem?
- How do you solve the Minimum Path Sum problem?
- How do you identify whether a problem is a DP problem?
- How do you convert recursive to bottom-up DP?
- How do you optimize 2D DP space?

### Dynamic Programming Advanced

- How do you solve Best Time to Buy and Sell Stock (one transaction)?
- How do you solve Buy and Sell Stock with unlimited transactions?
- What is state machine DP?
- How do you solve Buy and Sell Stock with cooldown?
- How do you solve Buy and Sell Stock with at most k transactions?
- How do you solve the Longest Palindromic Subsequence?
- What is interval DP?
- How do you solve Burst Balloons?
- What is bitmask DP and when do you use it?
- How do you solve Regular Expression Matching?
- How do you solve Matrix Chain Multiplication?
- How do you solve Palindrome Partitioning II (minimum cuts)?
- What is tree DP?
- How do you solve Interleaving String?
- How do you approach DP on strings?

### Recursion, Backtracking & Greedy

- How do you generate all permutations of an array?
- How do you generate all subsets of an array?
- What is backtracking and how does it differ from brute force?
- How do you solve the N-Queens problem?
- How do you solve the Jump Game problem?
- What is a greedy algorithm?
- What is recursion and what are its essential parts?
- How does the call stack work during recursion?
- How do you solve Word Search on a board?
- How do you solve the Gas Station problem?
- How do you solve Partition Labels?
- How do you generate combinations of k elements from n?
- How do you handle duplicates in subsets and combinations?
- When does greedy work and when does it fail?
- How does the Activity Selection problem demonstrate greedy?

### Bit Manipulation & Math

- How does XOR help find a single number where every other number appears twice?
- How do you check if a number is a power of two?
- How do you count the number of 1 bits (Hamming weight)?
- How do you find the missing number in an array of 0 to n?
- What are the basic bitwise operators?
- How do you check, set, clear, and toggle a specific bit?
- How do you find two non-repeating numbers where every other appears twice?
- How do you count total 1 bits for every number from 0 to n?
- What is bit masking for representing subsets?
- How do you compute GCD using Euclid's algorithm?
- How does the Sieve of Eratosthenes work?
- How do you reverse the bits of a 32-bit integer?
- How do you find the Hamming distance between two integers?
- How do you add two integers without + or - operators?
- How do you compute a^b mod m efficiently?
- What is modular arithmetic and why does it matter?
- How do you solve "single number" when one number appears once and others appear three times?

### System-Oriented DSA & Mobile Specific

- How do you implement an LRU Cache with O(1) get and put?
- How does an LFU Cache differ from LRU?
- How do you design a HashMap from scratch?
- How do you implement a Trie-based autocomplete system?
- How do you design a Twitter/News Feed system using DSA?
- How do you implement a stack that supports push, pop, and getMin in O(1)?
- How do you design a data structure for insert, remove, and getRandom in O(1)?
- How would you implement a time-based key-value store?
- How do you implement a basic rate limiter using a queue?
- How do you merge K sorted arrays?
- How do you solve the task scheduler problem?

## Mobile System Design

### Fundamentals of Mobile System Design

- How do you structure the high-level architecture of a mobile app?
- What is the single source of truth pattern and why does it matter?
- How do you choose an architecture pattern (MVVM, MVI) and set up dependency injection?
- How do you design caching in detail?
- How do you handle threading and concurrency?
- How do you design offline support?
- How do you decide on client-server communication?
- How do you design the API contract from the mobile client's perspective?
- How do you design the data model?
- How do you implement pagination on the client?
- What's the first thing you should do when given a mobile system design problem?
- How do you identify functional requirements for a mobile system design?
- How do you identify non-functional requirements?
- How do you define scope and resource constraints?
- How do you address non-functional requirements in the high-level design?
- How do you approach performance in a system design answer?
- How do you handle accessibility and localization?
- How do you address security concerns?

### Design: Chat Application

- How would you layer the client architecture for a chat app?
- Why WebSocket over long polling or SSE for real-time messaging?
- What data model would you use for messages?
- How does the offline message queue work?
- How do you handle message ordering? What problems can arise?
- How do you handle retry logic and delivery guarantees?
- How do you manage the WebSocket connection lifecycle?
- How do you structure the local Room database schema?
- What are the core features you would include in a chat application?
- What are the key non-functional requirements for a chat app?
- What's in scope and what's out of scope for a mobile system design interview?
- What does the API design look like for conversations and messages?
- How do push notifications work for a chat app?
- How do you sync message history after the app has been offline?
- How do you implement read receipts?
- How do you implement typing indicators?
- How do you handle media messages like images and videos?
- How do you make the chat list screen performant?
- How would you implement message search?
- How does end-to-end encryption work at a high level?
- How does group messaging differ from 1:1 chats?

### Design: News Feed & Social Media

- What are the core features of a social media feed?
- What are the non-functional requirements?
- What's in scope and what's out of scope for this design?
- What does the client architecture look like?
- How do you design the API for feed pagination?
- How do you model a feed item that supports multiple content types?
- What caching strategy works best for a feed?
- How do you handle image loading in the feed?
- How do you handle pull-to-refresh and real-time updates?
- How do you optimize RecyclerView or LazyColumn performance for a feed?
- How does prefetching work for both data and images?
- How do you implement optimistic UI for the like button?
- How would you handle video autoplay in the feed?
- How do you handle multiple view types in a feed?
- How do you handle offline caching with TTL?
- How do you track analytics events in a feed?
- How do you deep link to a specific post in the feed?
- How do you make the feed accessible?

### Design: Image Loading Library

- What does the overall loading pipeline look like?
- How does the memory cache work?
- How does the disk cache work?
- How do you handle lifecycle awareness?
- What is bitmap pooling and why is it important?
- How would you downsample images to avoid OutOfMemoryError?
- What's the threading strategy?
- What are the core responsibilities of an image loading library?
- How would you design the public API?
- What platforms and use cases should the library support?
- How do you generate cache keys?
- How do you handle placeholder and error images?
- What is request deduplication and how would you implement it?
- How do you handle image transformations?
- How do you respond to memory pressure?
- How do you handle disk cache eviction?
- How would you implement a priority system for image loads?
- How do Coil and Glide differ in their architecture?

### Design: File Downloader Library

- What are the core functional requirements for a file downloader library?
- What would you keep out of scope for an initial design?
- What are the main components in the architecture?
- What does the data model look like for a download task?
- How do HTTP Range requests enable resume?
- What states can a download be in, and how do transitions work?
- How does notification integration work?
- Walk through the pause/resume implementation in detail.
- How do you manage concurrent downloads?
- How do you implement progress tracking without flooding the UI?
- How should background downloads work on Android?
- What disk I/O strategy should you use?
- How do you verify file integrity after download?
- How do you handle retry on network failure?
- How does the priority queue work?
- How would you test a file downloader library?

### Design: Networking Library

- What are the core functional requirements?
- What is in scope and what is out of scope?
- What does the high-level architecture look like?
- How does the interceptor chain pattern work?
- How does the serialization layer work?
- How does connection pooling work at a high level?
- How does HTTP caching work?
- How would you implement the interceptor chain internally?
- How do connection pooling and keep-alive work internally?
- How does TLS and certificate pinning work?
- How do you implement request cancellation and timeouts?
- How does retry with exponential backoff work?
- How do multipart uploads work?
- How do you handle response streaming for large files?
- How do thread safety and the dispatcher work?
- How would you test a networking library?

### Design: Video Streaming App

- What are the core functional requirements for a video streaming app?
- What are the key non-functional requirements?
- What would you keep out of scope for a 45-minute design session?
- How would you structure the client architecture?
- Why ExoPlayer / Media3 as the playback engine?
- What APIs does the client need from the backend?
- What data models would you use on the client?
- How would you design the caching strategy?
- How does video delivery work with a CDN?
- How does adaptive bitrate streaming work on mobile?
- How would you configure the buffering strategy?
- How would you implement background playback with MediaSession?
- How would you implement offline downloads?
- How does DRM (Widevine) work on Android?
- How would you implement picture-in-picture mode?
- How would you support Chromecast?
- How would you handle video preloading in a scrollable list?
- How would you optimize for performance and battery life?

### Design: Music Streaming App

- What are the core features of a music streaming app?
- How would you scope this for a 45-minute interview?
- Why use Media3/ExoPlayer for audio playback?
- What APIs does the app need from the backend?
- What are the core data models?
- How do you keep music playing in the background?
- How does audio focus work in a music app?
- How would you implement gapless and crossfade playback?
- How would you handle offline downloads?
- How would you design the playback queue?
- How do MediaSession and media controls work together?
- How would you handle audio streaming and buffering?
- How would you implement an equalizer and audio effects?
- How would you handle Bluetooth, Cast, and car integration?
- How would you handle search and recommendation on the client?

### Design: eCommerce App

- What are the core functional requirements for an e-commerce app?
- What is out of scope for a typical interview?
- What API endpoints does the client need?
- What caching strategy would you use?
- How would you handle image loading in a product grid?
- How would you design search with filters and sorting?
- How would you optimize product listing performance?
- How would you design cart management — local vs server sync?
- How would you design the checkout flow with payment integration?
- How do you handle idempotency in checkout?
- How would you design order tracking with real-time updates?
- How would you handle push notifications for deals and delivery updates?
- How would you implement deep linking to a product page?
- How would you A/B test product layouts?
- How would you handle offline catalog browsing?
- How would you handle security — payment tokenization and certificate pinning?

### Design: Ride Sharing App

- What are the core features a ride-sharing app needs?
- Should the rider and driver be the same app or separate apps?
- How does real-time communication work?
- What API endpoints does the ride lifecycle need?
- What data models does the client need?
- How does map integration work?
- How does the ride state machine work?
- How does location tracking work under the hood?
- How do you animate the driver marker smoothly on the map?
- How do you optimize map rendering performance?
- How does ETA calculation work?
- How do you handle offline or poor connectivity during an active ride?
- How do you display surge pricing to the rider?
- What does the fare estimation flow look like?
- How does background location work during a ride?
- How does driver matching look from the client side?
- How would you abstract the map SDK so you could swap Google Maps for Mapbox?

### Design: Location Sharing & Maps

- What are the core functional requirements for a location sharing app?
- How would you scope the design for a 45-minute interview?
- How does real-time location sharing work?
- What APIs does the client need?
- What are the key data models?
- How do you integrate a map SDK?
- How does the location provider strategy work?
- How do you track location without killing the battery?
- How do you implement geofencing?
- How do you handle map rendering performance?
- How do you support offline maps?
- How does background location work on modern Android?
- How do you implement privacy controls for location sharing?
- How do you handle real-time updates at scale?
- How do you filter noisy location data?
- How do you test location features?

### Design: File Sync App

- What core features should a file sync app support on the client side?
- What should we exclude from scope for this interview?
- How does delta sync work with version vectors?
- How should the local file storage be structured?
- How would the sync engine coordinate everything?
- How would you implement chunked uploads with resume on failure?
- How does chunked download with resume work?
- How would you handle conflict resolution?
- How should background sync be scheduled?
- How would you detect local file changes?
- How would you optimize bandwidth usage?
- How should offline editing work?
- How should files be encrypted at rest and in transit?
- How would you implement selective sync?
- How would you handle very large files without running out of memory?

### Design: Offline-First Application

- What does "offline-first" actually mean? How is it different from just caching?
- What are the functional requirements for an offline-first app?
- What non-functional requirements matter most?
- How would you architect an offline-first app at a high level?
- Why use the local database as the source of truth instead of the server?
- How would you design the data model with sync metadata?
- How would you design the pending operations queue?
- How would you design the API for delta sync?
- How do you detect conflicts during sync?
- What are the main conflict resolution strategies?
- How would you implement field-level merge?
- How do you compact the pending operations queue before syncing?
- How do you use WorkManager for background sync?
- How do you monitor network state and trigger sync on reconnect?
- How do you handle schema migrations when users have unsynced data?
- How do you implement optimistic UI with rollback?
- How do you test offline scenarios?
- How do you handle large file sync like images or documents?

### Design: Analytics & Crash Reporting SDK

- What are the core functional requirements for an analytics and crash reporting SDK?
- Where does the SDK's responsibility end and the host app's begin?
- What does the overall SDK architecture look like?
- What does the backend ingestion endpoint look like?
- What do the data models look like?
- How does the batching strategy work?
- How should initialization and configuration work?
- How would you capture crashes?
- How does the ANR watchdog work internally?
- How would you implement the event batching and flush logic?
- How would you design local storage for pending events?
- How would you handle reliable delivery with retries?
- How would you handle privacy and consent?
- How would you minimize performance impact on the host app?
- How does session tracking work?
- How would you handle disk and memory limits?
- How would you test an analytics SDK?

## Behavioral & Career

### STAR Method & Common Questions

- What is the STAR method and how do you use it in interviews?
- How do you answer "Tell me about yourself"?
- How do you answer "What are your strengths"?
- How do you answer "What are your weaknesses"?
- How do you handle deadline pressure?
- How do you answer "What has been your biggest challenge"?
- How do you answer "Tell me about a conflict with a teammate"?
- How do you talk about handling failure?
- Tell me about a time you mentored someone.
- Describe a time you disagreed with your manager.
- Tell me about a time you went above and beyond.
- How do you prioritize when you have multiple competing demands?
- Tell me about a time you made a decision with incomplete information.
- How do you give feedback during code reviews?
- Describe a situation where you received critical feedback.
- Tell me about a time you pushed back on a product requirement.
- Tell me about a project where things didn't go as planned.

### Career Growth, Failure & Salary Negotiation

- Walk me through your career trajectory.
- What's your biggest professional failure and what did you learn?
- What are your strengths?
- What are your weaknesses?
- Where do you see yourself in 5 years?
- Why do you want to work at this company?
- Why are you leaving your current role?
- How do you approach salary negotiation?
- How do you evaluate a job offer beyond salary?
- How do you handle a counter offer from your current employer?
- Tell me about a time you failed at something significant. How did you recover?
- How do you stay current with technology?
- How do you handle imposter syndrome?
- Tell me about a production incident you caused. What happened and what changed?
- How do you talk about gaps in your resume?
- What questions should you ask the interviewer?
- How do you handle burnout?

### Leadership, Ownership & Technical Decisions

- What does technical leadership look like without a management title?
- What does it mean to own a feature end-to-end?
- How do you handle ambiguity in requirements?
- How do you approach making a trade-off between speed and quality?
- How do you decide whether to refactor or ship?
- Tell me about a time you influenced a decision without having authority.
- Describe a time you drove a significant technical decision. How did you get buy-in?
- How do you choose between two libraries or frameworks when both seem viable?
- Tell me about a time you made a technical decision that turned out to be wrong. What did you do?
- How do you approach a large, ambiguous project with no clear solution?
- How do you manage stakeholders who have conflicting priorities?
- Tell me about a time you took ownership of something outside your job description.
- How do you approach architecture decisions for a feature that needs to scale?
- Describe a time you had to balance technical debt with feature delivery.
- How do you make decisions when your team is split on an approach?
- Tell me about a time you had to say no to a stakeholder.
- How do you evaluate whether a new technology is worth adopting?

### Agile, Scrum & Team Collaboration

- What is Agile and why do teams use it?
- What is Scrum and how does it differ from Agile?
- What happens in each Scrum ceremony?
- What are story points and how do you estimate work?
- What is sprint velocity and how is it used?
- What is the Definition of Done?
- How do you give effective feedback in code reviews?
- How do you receive feedback on your own code?
- How do you collaborate with product managers who don't have technical context?
- How do you handle a blocker that's outside your control?
- How does your team handle knowledge sharing?
- How do you work effectively in a remote or distributed team?
- What makes a good sprint retrospective?
- How do you handle scope creep during a sprint?
- How do you estimate work when requirements are unclear?
- What's your approach to working with designers?

## Other Topics

- How does Kotlin Multiplatform (KMP) work?
- What is React Native and how does it differ from Flutter and native Android?
- How do you implement Dark Theme in an Android app?
- How would you identify users who have uninstalled your application?
- What are the key Android App Performance Metrics you should track?
- What is AAPT and what role does it play in the build process?
- How do you avoid API keys being checked into version control?
- How do you implement local notifications at an exact time?
- How do you use Android Studio Memory Profiler to diagnose memory issues?
- Can we identify users who have uninstalled our application?
- What is the Android App Release Checklist you follow before launching to production?


## Coding Tests

### What Companies Expect

- What are the common coding test formats?
- What do evaluators look for in a submission?
- What should a good README contain?
- How important is Git history?
- How should I structure a coding test project?
- Should I use Jetpack Compose or XML Views?
- What are the most common mistakes in coding tests?
- How should I handle ambiguous requirements?
- How should I manage time in a timed take-home test?
- What does good architecture look like for a small coding test app?
- How should I implement error handling?
- What level of testing is expected?
- How do I handle API keys securely?
- How should I approach a live coding interview vs a take-home test?
- What should I do if I can't finish the coding test in time?
- What differentiates a good submission from a great one?
- How do I decide what to include and what to skip when time is limited?

### Machine Coding Round

- What is a machine coding round and how does it differ from a take-home assignment?
- What are the common formats?
- What do evaluators actually watch for?
- What architecture should I default to?
- How should I spend the first 10-15 minutes?
- What's a good time management strategy for a 90-minute round?
- How do I handle API calls in a timed round?
- How do I display a list quickly in Compose?
- How do I deal with ambiguous requirements?
- What patterns should I have memorized?
- How do I add error handling quickly?
- What should I NOT do in a machine coding round?
- How do I write a quick unit test when time is short?
- How do I handle the last 10 minutes?
- What separates a strong submission from an average one?

### Build: Todo App

- How do you set up Room for a notes app?
- How do you display notes in a LazyColumn?
- How do you implement swipe-to-delete?
- How do you implement undo delete with a Snackbar?
- How do you build the add/edit note screen with form validation?
- How do you implement search and filter for notes?
- How do you implement sorting by date or priority?
- How do you structure clean architecture for a notes app?
- How do you set up Hilt for dependency injection?
- How do you handle offline-first architecture in a notes app?
- How do you support dark mode?
- How do you unit test the ViewModel?
- How do you write UI tests for the notes app?
- Why is the to-do app a good test of fundamentals?
- How do you handle the back press when editing a note with unsaved changes?

### Build: Weather App

- How do you set up Retrofit for API integration?
- How do you parse JSON responses into Kotlin data classes?
- How do you implement loading, error, and success states?
- How do you handle network errors properly?
- How do you structure MVVM for a weather/news feature?
- How do you implement search functionality?
- How do you implement pull-to-refresh?
- How do you implement offline caching with Room?
- How do you handle the separation between DTOs, entities, and domain models?
- How do you handle empty states in a list-based app?
- How do you unit test the repository layer?
- How do you structure the data layer to make it testable?
- How do you decide between StateFlow and LiveData for UI state?
- What's the difference between Retrofit and Ktor for API integration?
- How do you handle configuration changes without losing UI state?

### Build: Movie Listing

- What is the master-detail pattern and why is it common in coding tests?
- How do you build a scrollable list using LazyColumn in Compose?
- How do you build the same list using RecyclerView?
- How do you handle navigation from the list screen to the detail screen?
- How do you load images with Coil in a list?
- How do you structure the data layer for a list-detail feature?
- How should the detail screen load its data?
- How do you implement infinite scroll with Paging 3?
- How do you implement search and filter in a list screen?
- How do you handle state preservation on configuration changes?
- How do you design a clean navigation setup for a single-activity app?
- What is the difference between client-side and server-side pagination?
- How do you handle error states in a paged list?
- How do you optimize image loading in a large list?

### Build: StackOverflow Users App

- How do you set up Retrofit to call the StackOverflow or GitHub API?
- How do you display the fetched users or repos in a LazyColumn?
- How do you handle loading, error, and empty states?
- How do you display user avatars with Coil?
- How do you navigate to a detail screen?
- How do you implement search with debounce?
- How do you structure the project packages?
- How do you implement pagination with Paging 3?
- How do you implement manual pagination without Paging 3?
- How do you separate DTOs from domain models?
- How do you cache API responses in Room for offline access?
- How do you set up Hilt dependency injection for this project?
- How do you handle GitHub API rate limiting?
- What's the difference between the StackOverflow and GitHub API response structures?

### Build: Custom UI Component

- What is the difference between invalidate() and requestLayout()?
- What are the three phases of custom View rendering?
- How do you implement onMeasure in a custom View?
- How do you draw on a Canvas in a custom View?
- How do you handle touch events in a custom View?
- How do you do custom drawing in Compose?
- How do you create a custom layout in Jetpack Compose?
- How do you handle gestures in Compose?
- How do you animate a custom drawn component?
- How do you design a reusable API for a custom component?
- How do you make a custom component accessible?
- How do you handle intrinsic measurements in a custom Compose layout?
- How do you handle pinch-to-zoom in Compose?
- What are common performance pitfalls with custom drawn components?
- How would you build a custom chart component for a coding test?

### Code Review & Refactoring

- What are code smells and how do you spot them?
- How do you improve naming conventions in a codebase?
- How do you reduce coupling between classes?
- How do you refactor a God Activity or God ViewModel?
- What does it mean to refactor toward SOLID principles?
- How do you spot and remove code duplication?
- How do you extract use cases from a bloated ViewModel?
- How do you replace callbacks with coroutines or Flow?
- How do you improve testability of existing code?
- What do you look for first when reviewing unfamiliar code?
- How do you approach a refactoring challenge without breaking existing behavior?
- How do you spot and fix memory leaks in a code review?
- How do you identify and fix performance issues in a code review?
- How do you refactor error handling from scattered try-catch to a structured approach?
- How do you suggest architectural improvements without rewriting everything?
