---
title: "Dependency Injection — Hilt, Dagger & Koin"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 3
sequence: 38
description: "DI questions show up in every Android architecture interview."
---

## Dependency Injection — Hilt, Dagger & Koin — What Interviewers Really Ask

DI questions show up in every Android architecture interview. Interviewers expect you to know the difference between compile-time and runtime DI, understand scoping, and explain how Hilt simplifies Dagger — not just know annotations.

### Core Questions (Beginner → Intermediate)

#### Q1: What is Dependency Injection and why do we need it?

Dependency Injection means a class receives its dependencies from the outside instead of creating them itself. Without DI, a class creates its own dependencies with `val api = RetrofitClient.create()`, which makes it impossible to swap the implementation for testing or reuse the class in a different context.

```kotlin
// Without DI — hard to test, tightly coupled
class UserViewModel : ViewModel() {
    private val repository = UserRepository(RetrofitClient.create(), AppDatabase.getInstance())
}

// With DI — dependencies provided externally
class UserViewModel(
    private val repository: UserRepository
) : ViewModel()
```

With DI, you pass a fake repository in tests and the real one in production. The class doesn't know or care where its dependencies come from.

#### Q2: What is Inversion of Control?

Inversion of Control is the principle behind DI. Normally, a class controls its own dependencies — it decides what to create and when. With IoC, you invert that control — an external container or framework decides what to inject. The class just declares what it needs (through constructor parameters or annotations), and the framework provides it. DI is one way to implement IoC.

#### Q3: What is the difference between Service Locator and Dependency Injection?

Service Locator is a registry that classes query for their dependencies. The class asks the locator: "give me a UserRepository." With DI, the class doesn't ask for anything — dependencies are pushed to it through the constructor. The key difference is who initiates the lookup.

Service Locator hides dependencies — you can't tell from the constructor what a class needs. DI makes dependencies explicit. Koin uses a Service Locator pattern internally (you call `get()` or `inject()` to retrieve dependencies), while Dagger and Hilt use true constructor injection.

#### Q4: What is Dagger 2 and how does it work?

Dagger 2 is a compile-time DI framework that generates code to provide dependencies. It uses annotation processing to create factory classes at compile time, so there's no runtime reflection. You define `@Module` classes that provide dependencies, `@Component` interfaces that connect modules to injection targets, and `@Inject` to mark constructors or fields that need injection.

```kotlin
@Module
class NetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideUserApi(client: OkHttpClient): UserApi {
        return Retrofit.Builder()
            .client(client)
            .baseUrl("https://api.example.com/")
            .build()
            .create(UserApi::class.java)
    }
}
```

The compile-time approach means errors are caught at build time, not at runtime. If you forget to provide a dependency, the build fails.

#### Q5: What is Hilt and how is it different from Dagger?

Hilt is built on top of Dagger and simplifies it by providing predefined components and scopes for Android. With raw Dagger, you need to create your own Component interfaces, manage their lifecycle, and wire them to Android classes manually. Hilt does all of this automatically.

You annotate the Application class with `@HiltAndroidApp`, Activities/Fragments with `@AndroidEntryPoint`, and ViewModels with `@HiltViewModel`. Hilt generates the Dagger components and handles injection automatically. Under the hood, it's still Dagger — same compile-time code generation, same performance. Hilt just removes the boilerplate.

#### Q6: What are the main Hilt annotations?

- **@HiltAndroidApp** — Goes on the Application class. Triggers Hilt's code generation and creates the top-level `SingletonComponent`.
- **@AndroidEntryPoint** — Goes on Activities, Fragments, Services, BroadcastReceivers, and Views. Enables field injection in that class.
- **@HiltViewModel** — Goes on ViewModel classes. Allows `@Inject constructor` and automatic creation through `hiltViewModel()` or `by viewModels()`.
- **@Module** — Marks a class that provides dependencies. Combined with `@InstallIn` to specify which component the module belongs to.
- **@InstallIn** — Specifies which Hilt component a module is installed in. `@InstallIn(SingletonComponent::class)` for app-level, `@InstallIn(ViewModelComponent::class)` for ViewModel-scoped.
- **@Provides** — Used in a module to tell Hilt how to create an instance of a type when you can't use constructor injection (third-party classes, interfaces with builders).
- **@Binds** — Used in an abstract module to bind an interface to its implementation. More efficient than `@Provides` because it doesn't generate a factory method.

#### Q7: What is the difference between @Provides and @Binds?

`@Provides` is used when you need to write code to create the instance — calling constructors, builders, or factory methods. It goes in a concrete class or object.

`@Binds` is used when you just need to tell Hilt that an interface maps to a specific implementation. It goes in an abstract class with an abstract function. Dagger generates less code for `@Binds` because it doesn't need a factory — it reuses the binding directly.

```kotlin
// @Provides — needed for third-party or complex construction
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideUserApi(): UserApi {
        return Retrofit.Builder()
            .baseUrl("https://api.example.com/")
            .build()
            .create(UserApi::class.java)
    }
}

// @Binds — simple interface-to-implementation binding
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindUserRepository(impl: UserRepositoryImpl): UserRepository
}
```

#### Q8: What are Hilt components and their scopes?

Hilt has a hierarchy of components, each tied to an Android lifecycle:

- **SingletonComponent** — Lives for the entire app lifetime. Scope: `@Singleton`.
- **ActivityRetainedComponent** — Survives configuration changes. Scope: `@ActivityRetainedScoped`.
- **ViewModelComponent** — Tied to a ViewModel's lifetime. Scope: `@ViewModelScoped`.
- **ActivityComponent** — Tied to an Activity. Scope: `@ActivityScoped`.
- **FragmentComponent** — Tied to a Fragment. Scope: `@FragmentScoped`.
- **ViewComponent** — Tied to a View. Scope: `@ViewScoped`.
- **ServiceComponent** — Tied to a Service. Scope: `@ServiceScoped`.

Components form a hierarchy — `SingletonComponent` is at the top, and child components can access dependencies from parent components. A `@ViewModelScoped` dependency is created once per ViewModel instance and shared across all injections within that ViewModel.

#### Q9: What is Koin and how does it work?

Koin is a lightweight dependency injection framework that uses Kotlin DSL instead of annotation processing. You define modules with `single`, `factory`, and `viewModel` functions, and then start Koin in your Application class. Koin resolves dependencies at runtime using a service locator pattern.

```kotlin
val appModule = module {
    single<UserApi> {
        Retrofit.Builder()
            .baseUrl("https://api.example.com/")
            .build()
            .create(UserApi::class.java)
    }
    single<UserRepository> { UserRepositoryImpl(get(), get()) }
    viewModel { UserViewModel(get()) }
}

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidContext(this@MyApp)
            modules(appModule)
        }
    }
}
```

`single` creates one instance for the app lifetime (like `@Singleton`). `factory` creates a new instance every time. `viewModel` creates ViewModel instances. `get()` resolves a dependency from the container.

#### Q10: What is the difference between compile-time and runtime DI?

Dagger and Hilt validate the entire dependency graph at compile time. If a dependency is missing or there's a cycle, the build fails. Koin validates at runtime — if a dependency is missing, you get a crash when the code runs, not when it builds.

Compile-time DI is safer for large projects because errors are caught early. Runtime DI is simpler to set up and has no annotation processing or code generation overhead, which means faster build times. For small to medium apps, Koin is fine. For large apps with multiple developers and modules, Hilt's compile-time safety catches errors before they reach production.

### Deep Dive Questions (Advanced → Expert)

#### Q11: How does Hilt handle ViewModel injection internally?

When you annotate a ViewModel with `@HiltViewModel` and use `@Inject constructor`, Hilt generates a `ViewModelFactory` that knows how to create the ViewModel with its dependencies. Under the hood, Hilt uses `SavedStateHandle` support — every `@HiltViewModel` can inject `SavedStateHandle` along with other dependencies.

The `hiltViewModel()` Compose function or `by viewModels()` delegate uses Hilt's `ViewModelProvider.Factory` to create the ViewModel. The factory looks up the ViewModel class in the generated component and provides all constructor parameters. Without Hilt, you'd need to write a custom `ViewModelProvider.Factory` for every ViewModel that has constructor parameters.

#### Q12: What is AssistedInject and when do you use it?

AssistedInject is for cases where some dependencies come from the DI container and some are provided at runtime by the caller. A common example is when a ViewModel needs a user ID that comes from navigation arguments.

```kotlin
@AssistedFactory
interface ProfileViewModelFactory {
    fun create(userId: String): ProfileViewModel
}

class ProfileViewModel @AssistedInject constructor(
    private val repository: UserRepository,
    @Assisted private val userId: String
) : ViewModel()
```

`@Assisted` marks parameters provided at creation time, not by the container. `@AssistedFactory` generates a factory interface that Hilt can provide. The caller gets the factory injected and calls `factory.create(userId)`. This is useful when `SavedStateHandle` isn't sufficient or when you need to pass runtime values that aren't in the saved state.

#### Q13: What is @EntryPoint and when do you need it?

`@EntryPoint` lets you access Hilt-managed dependencies from classes that Hilt doesn't inject into — like `ContentProvider`, `WorkManager` workers, or third-party libraries that create their own objects. Since Hilt only supports certain Android entry points (`@AndroidEntryPoint`), you need `@EntryPoint` for everything else.

```kotlin
@EntryPoint
@InstallIn(SingletonComponent::class)
interface WorkerEntryPoint {
    fun userRepository(): UserRepository
}

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val entryPoint = EntryPointAccessors.fromApplication(
            applicationContext, WorkerEntryPoint::class.java
        )
        val repository = entryPoint.userRepository()
        repository.syncData()
        return Result.success()
    }
}
```

#### Q14: How does scoping work and what happens if you get it wrong?

Scoping determines how long a dependency instance lives. An unscoped dependency creates a new instance every time it's injected. `@Singleton` creates one instance for the entire app. `@ViewModelScoped` creates one instance per ViewModel.

Getting scoping wrong causes real bugs. If you scope a repository as `@Singleton` but it holds a reference to an Activity context, you have a memory leak. If you don't scope something that should be shared (like a database instance), you create multiple connections that waste resources and cause inconsistencies. If you scope a ViewModel dependency too broadly (Singleton instead of ViewModelScoped), stale data from a previous screen leaks into the current screen.

#### Q15: How do you test with Hilt?

Hilt provides `@HiltAndroidTest` for instrumented tests and the ability to replace modules with test modules using `@UninstallModules` and `@TestInstallIn`.

```kotlin
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [RepositoryModule::class]
)
@Module
object FakeRepositoryModule {
    @Provides
    @Singleton
    fun provideUserRepository(): UserRepository = FakeUserRepository()
}

@HiltAndroidTest
class UserScreenTest {
    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Inject
    lateinit var repository: UserRepository

    @Before
    fun setup() {
        hiltRule.inject()
    }
}
```

For unit tests (not instrumented), you don't need Hilt at all — just pass fakes through the constructor. Hilt testing is primarily for integration and UI tests where you need the full dependency graph but want to swap specific implementations.

#### Q16: How do you do manual DI without a framework?

Manual DI means creating your dependencies by hand and passing them through constructors. You create a container class (often called `AppContainer`) that holds all your dependencies and pass it around.

```kotlin
class AppContainer(private val context: Context) {
    private val database = AppDatabase.create(context)
    private val api = RetrofitClient.create()

    val userRepository: UserRepository = UserRepositoryImpl(api.userApi, database.userDao())
}

class MyApp : Application() {
    lateinit var container: AppContainer
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
```

This works for small apps but doesn't scale. You end up managing scoping manually, writing factory functions for ViewModels, and dealing with circular dependencies yourself. The advantage is zero build time overhead and zero magic — everything is visible in plain Kotlin.

#### Q17: What are Dagger Components and Subcomponents?

A Component is the bridge between modules (which provide dependencies) and injection targets (which need them). In raw Dagger, you define a `@Component` interface that lists its modules, and Dagger generates an implementation.

A Subcomponent is a component whose object graph extends a parent component. It can access everything in the parent. This is how Dagger models scoping — the `ApplicationComponent` is the root, and Activity or Fragment subcomponents inherit from it.

Hilt replaces this manual component hierarchy with its predefined components. Before Hilt, you had to define every Component, set up the parent-child relationship, and manage instance creation yourself. A medium-sized app could have 10-15 components. Hilt reduces this to annotations.

#### Q18: How does DI work in a multi-module project?

In a multi-module project with Hilt, each module defines its own `@Module` classes with `@InstallIn`. The modules are automatically picked up by Hilt's annotation processing across all Gradle modules.

Feature modules define modules installed in `ViewModelComponent` or `ActivityComponent`. Core modules define modules installed in `SingletonComponent`. The key rule is that feature modules should depend on abstractions (interfaces) from core modules, not on each other's implementations. This keeps the dependency graph clean and prevents feature-to-feature dependencies.

With Koin, each Gradle module exports a Koin `module`, and the app module loads all of them in `startKoin { modules(coreModule, featureAuthModule, featureCartModule) }`. The challenge with Koin in multi-module is that dependency errors only surface at runtime when the specific code path is reached.

### Common Follow-ups

- What is the difference between `@Singleton` and `@Reusable` in Dagger?
- How does Hilt handle injecting into Compose navigation destinations?
- What happens if two modules provide the same type? How do you resolve the conflict?
- How does `@Qualifier` work and when do you need it?
- What is the performance difference between Hilt and Koin at scale?
- Can you use Hilt and Koin together in the same project?
- How do you handle optional dependencies or feature flags in DI?
- What is Metro DI and how does it compare to Hilt?
