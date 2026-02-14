---
title: "Dependency Injection — Hilt, Dagger & Koin"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 3
sequence: 35
description: "DI questions show up in every Android architecture interview."
---

## Dependency Injection — Hilt, Dagger & Koin

DI shows up in almost every Android architecture interview. You need to know how DI works, the difference between compile-time and runtime approaches, and how Hilt simplifies Dagger.

#### What is Dependency Injection and why do I need it?

Dependency Injection means a class receives its dependencies from the outside instead of creating them itself. Without DI, the class is tightly coupled to its dependencies and I can't swap them for testing.

```kotlin
// Without DI — tightly coupled
class UserViewModel : ViewModel() {
    private val repository = UserRepository(RetrofitClient.create(), AppDatabase.getInstance())
}

// With DI — dependencies provided externally
class UserViewModel(
    private val repository: UserRepository
) : ViewModel()
```

With DI, I pass a fake repository in tests and the real one in production. The class doesn't care where its dependencies come from.

#### What is the difference between Service Locator and Dependency Injection?

Service Locator is a registry that classes query for their dependencies. The class asks: "give me a UserRepository." With DI, the class doesn't ask — dependencies are pushed to it through the constructor.

Service Locator hides dependencies. I can't tell from the constructor what a class needs. DI makes them explicit. Koin uses a Service Locator pattern internally (you call `get()` or `inject()`), while Dagger and Hilt use true constructor injection.

#### What is Dagger 2 and how does it work?

Dagger 2 is a compile-time DI framework. It uses annotation processing to generate factory classes at compile time, so there's no runtime reflection. I define `@Module` classes that provide dependencies, `@Component` interfaces that connect modules to injection targets, and `@Inject` to mark constructors or fields that need injection.

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

If I forget to provide a dependency, the build fails. Errors are caught at compile time, not runtime.

#### What is Hilt and how is it different from Dagger?

Hilt is built on top of Dagger. It provides predefined components and scopes for Android so I don't have to create my own Component interfaces, manage their lifecycle, or wire them to Android classes manually.

I annotate the Application class with `@HiltAndroidApp`, Activities/Fragments with `@AndroidEntryPoint`, and ViewModels with `@HiltViewModel`. Under the hood, it's still Dagger — same compile-time code generation, same performance. Hilt just removes the boilerplate.

#### What is the difference between @Provides and @Binds?

`@Provides` is for when I need to write code to create the instance — calling constructors, builders, or factory methods. It goes in a concrete class or object.

`@Binds` is for when I just need to map an interface to an implementation. It goes in an abstract class with an abstract function. Dagger generates less code for `@Binds` because it reuses the binding directly instead of generating a factory.

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

#### What are the main Hilt annotations?

- **@HiltAndroidApp** — Goes on the Application class. Triggers code generation and creates the top-level `SingletonComponent`.
- **@AndroidEntryPoint** — Goes on Activities, Fragments, Services, BroadcastReceivers, and Views. Enables field injection.
- **@HiltViewModel** — Goes on ViewModel classes. Allows `@Inject constructor` and automatic creation through `hiltViewModel()` or `by viewModels()`.
- **@Module** — Marks a class that provides dependencies. Combined with `@InstallIn` to specify which component.
- **@InstallIn** — Specifies which Hilt component a module belongs to. `@InstallIn(SingletonComponent::class)` for app-level, `@InstallIn(ViewModelComponent::class)` for ViewModel-scoped.
- **@Provides** — Tells Hilt how to create an instance when I can't use constructor injection.
- **@Binds** — Binds an interface to its implementation. More efficient than `@Provides`.

#### What are Hilt components and their scopes?

Hilt has a hierarchy of components, each tied to an Android lifecycle:

- **SingletonComponent** — Lives for the entire app. Scope: `@Singleton`.
- **ActivityRetainedComponent** — Survives configuration changes. Scope: `@ActivityRetainedScoped`.
- **ViewModelComponent** — Tied to a ViewModel's lifetime. Scope: `@ViewModelScoped`.
- **ActivityComponent** — Tied to an Activity. Scope: `@ActivityScoped`.
- **FragmentComponent** — Tied to a Fragment. Scope: `@FragmentScoped`.
- **ViewComponent** — Tied to a View. Scope: `@ViewScoped`.
- **ServiceComponent** — Tied to a Service. Scope: `@ServiceScoped`.

Components form a hierarchy. `SingletonComponent` is at the top, and child components can access dependencies from parent components.

#### What is Koin and how does it work?

Koin is a lightweight DI framework that uses Kotlin DSL instead of annotation processing. I define modules with `single`, `factory`, and `viewModel` functions, then start Koin in the Application class. It resolves dependencies at runtime using a service locator pattern.

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

`single` creates one instance for the app lifetime. `factory` creates a new instance every time. `get()` resolves a dependency from the container.

#### What is the difference between compile-time and runtime DI?

Dagger and Hilt validate the entire dependency graph at compile time. If a dependency is missing or there's a cycle, the build fails. Koin validates at runtime — if something is missing, I get a crash when the code runs.

Compile-time DI is safer for large projects because errors are caught early. Runtime DI is simpler to set up with no code generation overhead, which means faster build times. For small apps, Koin works fine. For large apps with multiple developers, Hilt's compile-time safety catches errors before they reach production.

#### How does scoping work and what happens if I get it wrong?

Scoping determines how long a dependency instance lives. An unscoped dependency creates a new instance every time it's injected. `@Singleton` creates one instance for the entire app. `@ViewModelScoped` creates one per ViewModel.

Getting scoping wrong causes real bugs. If I scope a repository as `@Singleton` but it holds a reference to an Activity context, that's a memory leak. If I don't scope a database instance, I create multiple connections that waste resources. If I scope a ViewModel dependency too broadly, stale data from a previous screen leaks into the current one.

#### How does Hilt handle ViewModel injection internally?

When I annotate a ViewModel with `@HiltViewModel` and use `@Inject constructor`, Hilt generates a `ViewModelFactory` that knows how to create it with its dependencies. Every `@HiltViewModel` can also inject `SavedStateHandle` automatically.

The `hiltViewModel()` Compose function or `by viewModels()` delegate uses Hilt's `ViewModelProvider.Factory`. The factory looks up the ViewModel class in the generated component and provides all constructor parameters. Without Hilt, I'd need to write a custom factory for every ViewModel with constructor parameters.

#### What is @EntryPoint and when do I need it?

`@EntryPoint` lets me access Hilt-managed dependencies from classes that Hilt doesn't inject into — like `ContentProvider`, `WorkManager` workers, or third-party libraries. Since Hilt only supports certain Android entry points via `@AndroidEntryPoint`, I need `@EntryPoint` for everything else.

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

#### What is AssistedInject and when do I use it?

AssistedInject is for cases where some dependencies come from the DI container and some are provided at runtime. A common example is a ViewModel that needs a user ID from navigation arguments.

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

`@Assisted` marks parameters provided at creation time. `@AssistedFactory` generates a factory that Hilt can provide. The caller gets the factory injected and calls `factory.create(userId)`.

#### How do I test with Hilt?

Hilt provides `@HiltAndroidTest` for instrumented tests. I can replace modules with test modules using `@TestInstallIn`.

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

For unit tests, I don't need Hilt at all — just pass fakes through the constructor. Hilt testing is for integration and UI tests where I need the full dependency graph but want to swap specific implementations.

#### What are Dagger Components and Subcomponents?

A Component is the bridge between modules (which provide dependencies) and injection targets (which need them). In raw Dagger, I define a `@Component` interface that lists its modules, and Dagger generates an implementation.

A Subcomponent extends a parent component's object graph. It can access everything in the parent. This is how Dagger models scoping — the `ApplicationComponent` is the root, and Activity or Fragment subcomponents inherit from it. Hilt replaces this manual hierarchy with its predefined components. Before Hilt, a medium-sized app could have 10-15 components defined manually.

#### How do I do manual DI without a framework?

Manual DI means creating dependencies by hand and passing them through constructors. I create a container class that holds everything and pass it around.

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

This works for small apps but doesn't scale. I end up managing scoping manually, writing factory functions for ViewModels, and dealing with circular dependencies myself. The advantage is zero build overhead and everything is visible in plain Kotlin.

#### How does DI work in a multi-module project?

With Hilt, each Gradle module defines its own `@Module` classes with `@InstallIn`. Hilt's annotation processing picks them up automatically across all modules. Feature modules typically install in `ViewModelComponent` or `ActivityComponent`, while core modules install in `SingletonComponent`. The key rule is that feature modules depend on abstractions from core modules, not on each other.

With Koin, each Gradle module exports a Koin `module`, and the app module loads all of them in `startKoin { modules(coreModule, featureAuthModule, featureCartModule) }`. The challenge is that dependency errors only surface at runtime when the specific code path is reached.

### Common Follow-ups

- What is the difference between `@Singleton` and `@Reusable` in Dagger?
- How does Hilt handle injecting into Compose navigation destinations?
- What happens if two modules provide the same type? How do I resolve the conflict?
- How does `@Qualifier` work and when do I need it?
- What is the performance difference between Hilt and Koin at scale?
- Can I use Hilt and Koin together in the same project?
- How do I handle optional dependencies or feature flags in DI?
