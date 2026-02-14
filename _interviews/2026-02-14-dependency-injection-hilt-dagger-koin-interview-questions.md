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

If there's one topic that shows up in every single Android architecture interview, it's DI. You need to know how it works, why it exists, and what separates compile-time from runtime approaches. Here's the thing — once you really get DI, half the architecture questions become easy.

#### What is Dependency Injection and why do I need it?

Think of it like ordering coffee at a cafe. You don't walk behind the counter, grind the beans, steam the milk, and pour it yourself. You just say "latte, please" and it shows up. That's DI. A class receives its dependencies from the outside instead of making them itself.

```kotlin
// Without DI — you're behind the counter making your own coffee
class UserViewModel : ViewModel() {
    private val repository = UserRepository(RetrofitClient.create(), AppDatabase.getInstance())
}

// With DI — someone hands you the coffee
class UserViewModel(
    private val repository: UserRepository
) : ViewModel()
```

Without DI, your class is glued to its dependencies. Want to test with a fake repository? Too bad, it already created the real one. With DI, you pass a fake in tests and the real one in production. The class doesn't care where its stuff comes from.

#### What is the difference between Service Locator and Dependency Injection?

Service Locator is like a vending machine — the class walks up and says "give me a UserRepository." With DI, the class doesn't ask for anything. Dependencies just show up at its door through the constructor.

The big difference? Service Locator hides what a class needs. I can't look at the constructor and know its dependencies. DI makes them explicit — it's all right there in the constructor signature. Koin actually uses a Service Locator pattern internally (you call `get()` or `inject()`), while Dagger and Hilt use true constructor injection.

#### What is Dagger 2 and how does it work?

Dagger 2 is a compile-time DI framework. It uses annotation processing to generate factory classes at compile time — no runtime reflection involved. I define `@Module` classes that provide dependencies, `@Component` interfaces that connect modules to injection targets, and `@Inject` to mark constructors or fields that need injection.

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

Here's the best part — if I forget to provide a dependency, the build fails. Not a runtime crash at 2 AM. A build error, right there in the IDE.

#### What is Hilt and how is it different from Dagger?

Hilt is Dagger wearing a nice suit. It's built on top of Dagger and provides predefined components and scopes for Android, so I don't have to create my own Component interfaces, manage their lifecycle, or manually wire them to Android classes.

I annotate the Application class with `@HiltAndroidApp`, Activities and Fragments with `@AndroidEntryPoint`, and ViewModels with `@HiltViewModel`. Under the hood, it's still Dagger — same compile-time code generation, same performance. Hilt just takes away the boilerplate that made raw Dagger painful.

> **🧠 Think about it:** If Hilt is just Dagger underneath, why did Google build it? What was so painful about raw Dagger that an entire wrapper framework was needed?

#### What is the difference between @Provides and @Binds?

Yeah, this trips up everyone.

`@Provides` is for when I need to write actual code to create something — calling constructors, builders, factory methods. It goes in a concrete class or object. `@Binds` is for the simpler case where I just need to say "hey, when someone asks for this interface, give them this implementation." It goes in an abstract class with an abstract function.

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

Dagger generates less code for `@Binds` because it reuses the binding directly instead of generating a whole factory. So when you can use `@Binds`, use it.

#### What are the main Hilt annotations?

- **@HiltAndroidApp** — Goes on the Application class. Triggers code generation and creates the top-level `SingletonComponent`
- **@AndroidEntryPoint** — Goes on Activities, Fragments, Services, BroadcastReceivers, and Views. Enables field injection
- **@HiltViewModel** — Goes on ViewModel classes. Allows `@Inject constructor` and automatic creation through `hiltViewModel()` or `by viewModels()`
- **@Module** — Marks a class that provides dependencies. Combined with `@InstallIn` to specify which component
- **@InstallIn** — Specifies which Hilt component a module belongs to. `@InstallIn(SingletonComponent::class)` for app-level, `@InstallIn(ViewModelComponent::class)` for ViewModel-scoped
- **@Provides** — Tells Hilt how to create an instance when I can't use constructor injection
- **@Binds** — Binds an interface to its implementation. More efficient than `@Provides`

#### What are Hilt components and their scopes?

Think of Hilt components like a set of nested boxes. The biggest box is the app itself, and inside it are smaller boxes for Activities, Fragments, and Views. Each box has a lifespan, and anything you put in a box lives exactly as long as that box does.

- **SingletonComponent** — Lives for the entire app. Scope: `@Singleton`
- **ActivityRetainedComponent** — Survives configuration changes. Scope: `@ActivityRetainedScoped`
- **ViewModelComponent** — Tied to a ViewModel's lifetime. Scope: `@ViewModelScoped`
- **ActivityComponent** — Tied to an Activity. Scope: `@ActivityScoped`
- **FragmentComponent** — Tied to a Fragment. Scope: `@FragmentScoped`
- **ViewComponent** — Tied to a View. Scope: `@ViewScoped`
- **ServiceComponent** — Tied to a Service. Scope: `@ServiceScoped`

Components form a hierarchy. `SingletonComponent` is the biggest box at the top, and child components can reach into parent boxes to grab their dependencies — but not the other way around.

#### What is Koin and how does it work?

Koin takes a completely different approach. Instead of annotation processing and code generation, it uses a pure Kotlin DSL. I define modules with `single`, `factory`, and `viewModel` functions, start Koin in the Application class, and it resolves everything at runtime.

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

`single` creates one instance for the app lifetime. `factory` creates a new instance every time. `get()` resolves a dependency from the container. It's readable, it's fast to set up, and it feels very Kotlin-native.

#### What is the difference between compile-time and runtime DI?

Here's the thing. Dagger and Hilt validate the entire dependency graph at compile time. If a dependency is missing or there's a cycle, the build fails. Koin validates at runtime — if something is missing, you get a crash when the code actually runs.

For small apps, Koin works great. Fast build times, no code generation, less boilerplate. But for large apps with multiple developers across multiple modules, Hilt's compile-time safety is worth its weight in gold. You catch missing dependencies before they reach production, not when a user taps a button on a screen nobody tested.

> **🧠 Think about it:** Your app has 200+ Koin definitions across 15 modules. A teammate removes one `single` declaration. How would you even know something broke until that specific screen is opened at runtime?

#### How does scoping work and what happens if I get it wrong?

Scoping is like deciding how long to keep leftovers. An unscoped dependency is a fresh meal every time — new instance on every injection. `@Singleton` is that one jar of pickles that lives in the fridge forever. `@ViewModelScoped` lasts as long as that particular ViewModel.

Getting scoping wrong causes real bugs. If I scope a repository as `@Singleton` but it holds a reference to an Activity context, that's a memory leak — the Activity can't be garbage collected because the singleton holds onto it. If I don't scope a database instance, I end up with multiple connections wasting resources. If I scope a ViewModel dependency too broadly, stale data from a previous screen leaks into the current one.

#### How does Hilt handle ViewModel injection internally?

When I annotate a ViewModel with `@HiltViewModel` and use `@Inject constructor`, Hilt generates a `ViewModelFactory` that knows how to create it with all its dependencies. Every `@HiltViewModel` can also inject `SavedStateHandle` automatically — that comes for free.

The `hiltViewModel()` Compose function or `by viewModels()` delegate uses Hilt's `ViewModelProvider.Factory`. The factory looks up the ViewModel class in the generated component and provides all constructor parameters. Plot twist: without Hilt, I'd need to write a custom factory for every single ViewModel that takes constructor parameters. That's a lot of factories.

#### What is @EntryPoint and when do I need it?

`@EntryPoint` is the escape hatch. Hilt can only inject into classes it knows about — Activities, Fragments, Services, ViewModels. But what about `ContentProvider`, `WorkManager` workers, or some third-party library class? That's where `@EntryPoint` comes in.

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

I define an interface annotated with `@EntryPoint`, install it in the right component, and then use `EntryPointAccessors` to grab what I need. It's a bit manual, but it works anywhere.

#### What is AssistedInject and when do I use it?

Here's a scenario: I have a ViewModel that needs a `UserRepository` from DI and a `userId` from navigation arguments. The repository comes from the container, but the userId is only known at runtime. AssistedInject handles exactly this — some dependencies from DI, some provided at creation time.

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

`@Assisted` marks the runtime parameters. `@AssistedFactory` generates a factory that Hilt can inject. The caller gets the factory and calls `factory.create(userId)` with the actual value.

#### How do I test with Hilt?

Hilt provides `@HiltAndroidTest` for instrumented tests. The trick is `@TestInstallIn` — it lets me swap out entire modules with test versions.

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

For unit tests, I don't need Hilt at all — just pass fakes through the constructor. That's the whole point of constructor injection. Hilt testing is for integration and UI tests where I need the full dependency graph but want to swap specific implementations.

> **🧠 Think about it:** If I can just pass fakes through the constructor for unit tests, what does that tell you about classes that are hard to test? They probably aren't using proper DI.

#### What are Dagger Components and Subcomponents?

A Component is the bridge between modules (which provide dependencies) and the classes that need them. In raw Dagger, I define a `@Component` interface that lists its modules, and Dagger generates the implementation.

A Subcomponent extends a parent component's object graph — it can access everything in the parent, plus its own stuff. This is how Dagger models scoping. The `ApplicationComponent` is the root, and Activity or Fragment subcomponents inherit from it. Hilt replaces this entire manual hierarchy with its predefined components. Before Hilt, a medium-sized app could have 10-15 components wired together by hand. Yeah, it was painful.

#### How do I do manual DI without a framework?

Manual DI is the simplest approach — create dependencies by hand and pass them through constructors. I make a container class that holds everything.

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

This works for small apps but doesn't scale. I end up managing scoping manually, writing custom factory functions for every ViewModel, and dealing with circular dependencies myself. The upside? Zero build overhead and everything is visible in plain Kotlin. No magic, no generated code. For a weekend project, this is totally fine.

#### How does DI work in a multi-module project?

With Hilt, each Gradle module defines its own `@Module` classes with `@InstallIn`. Hilt's annotation processing picks them up automatically across all modules — I don't need to register them anywhere. Feature modules typically install in `ViewModelComponent` or `ActivityComponent`, while core modules install in `SingletonComponent`. The key rule: feature modules depend on abstractions from core modules, not on each other.

With Koin, each Gradle module exports a Koin `module`, and the app module loads all of them in `startKoin { modules(coreModule, featureAuthModule, featureCartModule) }`. It's straightforward, but the challenge is that dependency errors only surface at runtime when the specific code path is reached. In a 15-module project, that's a lot of code paths to cover.

### Common Follow-ups

- What is the difference between `@Singleton` and `@Reusable` in Dagger?
- How does Hilt handle injecting into Compose navigation destinations?
- What happens if two modules provide the same type? How do I resolve the conflict?
- How does `@Qualifier` work and when do I need it?
- What is the performance difference between Hilt and Koin at scale?
- Can I use Hilt and Koin together in the same project?
- How do I handle optional dependencies or feature flags in DI?
