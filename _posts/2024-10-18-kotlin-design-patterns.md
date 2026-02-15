---
title: Design Patterns Guide in Kotlin
layout: post
sequence: 12
categories: post
tags:
  - Kotlin
  - Architecture
  
---

A while back I was reviewing a pull request on a fairly mature Android project, and I noticed the same structural problems repeating across different features — a god-object ViewModel doing everything, manual object creation scattered everywhere, tightly coupled third-party SDK calls that made testing impossible. The codebase had no consistent patterns. Every feature was solving the same problems in different ways, and none of them were solving them well.

That experience made me appreciate how much design patterns matter — not in the academic Gang of Four textbook sense, but in the practical "I need this code to be testable, swappable, and not a nightmare to change in six months" sense. Kotlin makes many of these patterns far more expressive than Java ever did. Some patterns that required 50+ lines of boilerplate in Java collapse into a few lines of idiomatic Kotlin. Others become so natural that you're already using them without realizing it. Here's a breakdown of the patterns I find most useful in real Android codebases, with implementations you can actually use.

## Creational Patterns

### Singleton — Kotlin's `object` Keyword

Kotlin's `object` keyword gives you a **thread-safe singleton** for free. Under the hood, the compiler generates a class with a private constructor and a static `INSTANCE` field initialized in a static block — the same pattern you'd write manually in Java but without the boilerplate. This is safe because the JVM guarantees that static initializers run exactly once, in a thread-safe manner.

```kotlin
object AnalyticsTracker {
    private val events = mutableListOf<AnalyticsEvent>()

    fun track(event: AnalyticsEvent) {
        events.add(event)
        // flush to remote service
    }

    fun getEventCount(): Int = events.size
}

// Usage anywhere in the app
AnalyticsTracker.track(AnalyticsEvent.ScreenView("HomeScreen"))
```

Here's the thing — while `object` is convenient, I'd argue you should almost never use it directly for anything that touches the network, database, or shared state. The problem is testability. You can't mock an `object` easily, and you can't swap it for a fake in tests. A **companion object factory** is a better middle ground when you need a singleton-like access pattern but still want testability.

```kotlin
class UserRepository private constructor(
    private val api: UserApi,
    private val cache: UserCache
) {
    companion object {
        @Volatile
        private var instance: UserRepository? = null

        fun getInstance(api: UserApi, cache: UserCache): UserRepository {
            return instance ?: synchronized(this) {
                instance ?: UserRepository(api, cache).also { instance = it }
            }
        }
    }

    suspend fun getUser(id: String): User {
        return cache.get(id) ?: api.fetchUser(id).also { cache.put(id, it) }
    }
}
```

IMO, in any modern Android project using Hilt or Koin, you should let the DI framework handle singleton scoping with `@Singleton` instead of managing it yourself. The companion object factory approach is really for pre-DI codebases or library code where you can't assume a DI framework exists.

### Factory — Sealed Class Factories

The **Factory pattern** shines in Android when you need to create different implementations based on runtime conditions. Kotlin's sealed classes make this particularly clean because the compiler enforces exhaustive `when` expressions — you literally cannot forget to handle a case.

```kotlin
sealed class ApiRepository {
    abstract suspend fun fetchProducts(): List<Product>

    class Production(private val api: ProductApi) : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return api.getProducts().map { it.toDomain() }
        }
    }

    class Staging(private val api: ProductApi) : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return api.getProducts().map { it.toDomain() }
                .also { Log.d("Staging", "Fetched ${it.size} products") }
        }
    }

    class Mock : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return listOf(Product("test-1", "Mock Product", 9.99))
        }
    }

    companion object {
        fun create(buildConfig: BuildConfig, api: ProductApi): ApiRepository {
            return when {
                buildConfig.isDebug && buildConfig.useMocks -> Mock()
                buildConfig.isDebug -> Staging(api)
                else -> Production(api)
            }
        }
    }
}
```

Where this really pays off is **ViewModel creation** with `ViewModelProvider.Factory`. Before Hilt's `@HiltViewModel` simplified things, you'd write factories like this — and you still need them when your ViewModel has constructor parameters that don't come from Hilt.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    class Factory(
        private val searchRepository: SearchRepository,
        private val analyticsTracker: AnalyticsTracker
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SearchViewModel(searchRepository, analyticsTracker) as T
        }
    }
}

// In Fragment
val viewModel: SearchViewModel by viewModels {
    SearchViewModel.Factory(searchRepository, analyticsTracker)
}
```

### Builder — When Kotlin Makes It (Mostly) Unnecessary

Here's an honest take — the traditional Java-style Builder pattern is largely unnecessary in Kotlin. Named parameters and default values solve the same problem with less code. A Java builder with 8 optional fields becomes a single data class constructor.

```kotlin
// Instead of a Builder, just use named params with defaults
data class NotificationConfig(
    val title: String,
    val body: String,
    val channelId: String = "default",
    val priority: Int = NotificationCompat.PRIORITY_DEFAULT,
    val autoCancel: Boolean = true,
    val smallIcon: Int = R.drawable.ic_notification,
    val color: Int = Color.BLUE
)

// Clean call site — only specify what you need
val config = NotificationConfig(
    title = "New Message",
    body = "You have 3 unread messages",
    priority = NotificationCompat.PRIORITY_HIGH
)
```

But builders aren't completely dead in Kotlin. **DSL-style builders** are genuinely useful when you're constructing nested or hierarchical structures. Kotlin's `@DslMarker` and lambda-with-receiver pattern make this idiomatic.

```kotlin
@DslMarker
annotation class NetworkDsl

@NetworkDsl
class RetrofitClientBuilder {
    var baseUrl: String = ""
    var connectTimeout: Long = 30_000
    var readTimeout: Long = 30_000
    private val interceptors = mutableListOf<Interceptor>()

    fun interceptor(block: () -> Interceptor) {
        interceptors.add(block())
    }

    fun build(): Retrofit {
        val client = OkHttpClient.Builder()
            .connectTimeout(connectTimeout, TimeUnit.MILLISECONDS)
            .readTimeout(readTimeout, TimeUnit.MILLISECONDS)
            .apply { interceptors.forEach { addInterceptor(it) } }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}

fun retrofitClient(block: RetrofitClientBuilder.() -> Unit): Retrofit {
    return RetrofitClientBuilder().apply(block).build()
}

// Usage
val retrofit = retrofitClient {
    baseUrl = "https://api.myapp.com/"
    connectTimeout = 15_000
    interceptor { HttpLoggingInterceptor() }
    interceptor { AuthInterceptor(tokenProvider) }
}
```

Use DSL builders when you have nested construction, multiple repeated sub-elements, or when you want to enforce a structured construction API. For flat objects with optional fields, just use data classes with defaults.

## Structural Patterns

### Adapter — Converting Between Data Layers

The **Adapter pattern** is one you're probably already using without naming it. Every time you convert a network DTO to a domain model to a UI model, that's an adapter. The real question is where to put the conversion logic and how to keep it clean.

I prefer extension functions as adapters. They keep the mapping logic close to the data classes without polluting the models themselves with conversion knowledge.

```kotlin
// Network layer
data class UserResponse(
    val id: String,
    val first_name: String,
    val last_name: String,
    val avatar_url: String?,
    val created_at: String
)

// Domain layer
data class User(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val memberSince: LocalDate
)

// UI layer
data class UserUiModel(
    val id: String,
    val displayName: String,
    val avatarInitials: String,
    val avatarUrl: String?,
    val memberSinceFormatted: String
)

// Adapter: DTO → Domain
fun UserResponse.toDomain(): User = User(
    id = id,
    displayName = "$first_name $last_name".trim(),
    avatarUrl = avatar_url,
    memberSince = LocalDate.parse(created_at, DateTimeFormatter.ISO_DATE)
)

// Adapter: Domain → UI
fun User.toUiModel(): UserUiModel = UserUiModel(
    id = id,
    displayName = displayName,
    avatarInitials = displayName.split(" ")
        .mapNotNull { it.firstOrNull()?.uppercase() }
        .joinToString(""),
    avatarUrl = avatarUrl,
    memberSinceFormatted = "Member since ${memberSince.format(
        DateTimeFormatter.ofPattern("MMM yyyy")
    )}"
)
```

This three-layer model (DTO → Domain → UI) might seem like overkill for small features, but it pays off fast. When the backend changes a field name from `first_name` to `firstName`, you only touch one mapper. When the UI needs to display dates differently on two screens, you add another UI model without touching the domain.

### Decorator — Adding Behavior Without Modifying Code

The **Decorator pattern** wraps an existing object to add behavior. In Kotlin, the `by` keyword makes this ridiculously clean through **interface delegation** — you get the decorator pattern with almost zero boilerplate.

```kotlin
interface ImageLoader {
    fun load(url: String, target: ImageView)
    fun preload(url: String)
    fun clearCache()
}

class CoilImageLoader(private val context: Context) : ImageLoader {
    override fun load(url: String, target: ImageView) {
        target.load(url)
    }
    override fun preload(url: String) {
        context.imageLoader.enqueue(ImageRequest.Builder(context).data(url).build())
    }
    override fun clearCache() {
        context.imageLoader.memoryCache?.clear()
    }
}

// Decorator that adds logging — delegates everything else
class LoggingImageLoader(
    private val delegate: ImageLoader
) : ImageLoader by delegate {
    override fun load(url: String, target: ImageView) {
        Log.d("ImageLoader", "Loading: $url")
        val startTime = SystemClock.elapsedRealtime()
        delegate.load(url, target)
        Log.d("ImageLoader", "Loaded in ${SystemClock.elapsedRealtime() - startTime}ms")
    }
}
```

The `by delegate` syntax means `LoggingImageLoader` automatically forwards `preload()` and `clearCache()` to the wrapped loader. You only override what you want to decorate. This is the same concept behind **OkHttp Interceptors** — each interceptor decorates the HTTP call chain, adding headers, logging, retries, or caching without modifying the core networking logic.

## Behavioural Patterns

### Observer — Flow and LiveData

If you're writing Android code with ViewModels, you're already using the **Observer pattern** constantly. `StateFlow`, `SharedFlow`, and `LiveData` are all implementations of it. The manual observer pattern with `addObserver()`/`removeObserver()` is essentially dead in modern Android — the framework handles subscription and lifecycle for you.

```kotlin
class ProductListViewModel(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProductListState>(ProductListState.Loading)
    val uiState: StateFlow<ProductListState> = _uiState.asStateFlow()

    // SharedFlow for one-time events that shouldn't replay on config change
    private val _events = MutableSharedFlow<ProductListEvent>()
    val events: SharedFlow<ProductListEvent> = _events.asSharedFlow()

    init {
        loadProducts()
    }

    private fun loadProducts() {
        viewModelScope.launch {
            _uiState.value = ProductListState.Loading
            productRepository.getProducts()
                .catch { e -> _uiState.value = ProductListState.Error(e.message ?: "Unknown error") }
                .collect { products ->
                    _uiState.value = ProductListState.Success(products)
                }
        }
    }

    fun onProductClicked(productId: String) {
        viewModelScope.launch {
            _events.emit(ProductListEvent.NavigateToDetail(productId))
        }
    }
}

sealed interface ProductListState {
    data object Loading : ProductListState
    data class Success(val products: List<Product>) : ProductListState
    data class Error(val message: String) : ProductListState
}

sealed interface ProductListEvent {
    data class NavigateToDetail(val productId: String) : ProductListEvent
    data class ShowSnackbar(val message: String) : ProductListEvent
}
```

The key distinction here: **StateFlow** is for state (always has a current value, replays last value to new collectors) and **SharedFlow** is for events (no replay by default, doesn't hold a current value). Getting this wrong is one of the most common bugs I've seen — using `StateFlow` for navigation events means the navigation fires again on every configuration change.

### Strategy — Swappable Behavior via Interfaces

The **Strategy pattern** is about defining a family of algorithms and making them interchangeable. In Android, this shows up everywhere — different authentication methods, analytics providers, image loading strategies. Combined with DI, it becomes very powerful.

```kotlin
interface AuthStrategy {
    suspend fun authenticate(credentials: Credentials): AuthResult
    suspend fun refreshToken(token: String): AuthResult
    fun logout()
}

class GoogleAuthStrategy(
    private val googleSignInClient: GoogleSignInClient
) : AuthStrategy {
    override suspend fun authenticate(credentials: Credentials): AuthResult {
        // Google Sign-In flow
        return AuthResult.Success(token = "google_token", provider = "google")
    }
    override suspend fun refreshToken(token: String): AuthResult { /* ... */ }
    override fun logout() { googleSignInClient.signOut() }
}

class EmailAuthStrategy(
    private val authApi: AuthApi
) : AuthStrategy {
    override suspend fun authenticate(credentials: Credentials): AuthResult {
        val response = authApi.login(credentials.email, credentials.password)
        return if (response.isSuccessful) {
            AuthResult.Success(token = response.body()!!.token, provider = "email")
        } else {
            AuthResult.Failure(response.message())
        }
    }
    override suspend fun refreshToken(token: String): AuthResult { /* ... */ }
    override fun logout() { /* clear stored credentials */ }
}

// ViewModel doesn't care which strategy — inject via DI
class LoginViewModel(private val authStrategy: AuthStrategy) : ViewModel() {
    fun login(credentials: Credentials) {
        viewModelScope.launch {
            when (val result = authStrategy.authenticate(credentials)) {
                is AuthResult.Success -> { /* navigate to home */ }
                is AuthResult.Failure -> { /* show error */ }
            }
        }
    }
}
```

The real value here is testability. In unit tests, you pass in a `FakeAuthStrategy` that returns whatever result you need — no mocking frameworks, no network calls, no flakiness. This is the same approach you'd use for swapping analytics providers (Firebase vs Mixpanel), or feature flag systems (LaunchDarkly vs local config).

### State — Sealed Class State Machines

The **State pattern** goes beyond just having a sealed class to represent UI states. A proper state machine enforces **valid transitions** — you can't go from `LoggedOut` directly to `ProfileLoaded` without passing through `Authenticating` first.

```kotlin
sealed interface AuthState {
    data object LoggedOut : AuthState
    data object Authenticating : AuthState
    data class Authenticated(val user: User) : AuthState
    data class AuthError(val message: String, val retryCount: Int = 0) : AuthState

    // Enforce valid transitions
    fun transition(event: AuthEvent): AuthState = when (this) {
        is LoggedOut -> when (event) {
            is AuthEvent.LoginRequested -> Authenticating
            else -> this // ignore invalid transitions
        }
        is Authenticating -> when (event) {
            is AuthEvent.LoginSuccess -> Authenticated(event.user)
            is AuthEvent.LoginFailed -> AuthError(event.message)
            else -> this
        }
        is Authenticated -> when (event) {
            is AuthEvent.LogoutRequested -> LoggedOut
            else -> this
        }
        is AuthError -> when (event) {
            is AuthEvent.LoginRequested -> if (retryCount < 3) Authenticating else this
            is AuthEvent.LogoutRequested -> LoggedOut
            else -> this
        }
    }
}

sealed interface AuthEvent {
    data object LoginRequested : AuthEvent
    data class LoginSuccess(val user: User) : AuthEvent
    data class LoginFailed(val message: String) : AuthEvent
    data object LogoutRequested : AuthEvent
}

class AuthViewModel(private val authStrategy: AuthStrategy) : ViewModel() {
    private val _state = MutableStateFlow<AuthState>(AuthState.LoggedOut)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    fun onEvent(event: AuthEvent) {
        val newState = _state.value.transition(event)
        _state.value = newState

        // Side effects based on state transitions
        when (newState) {
            is AuthState.Authenticating -> performLogin()
            else -> { /* no side effect */ }
        }
    }

    private fun performLogin() {
        viewModelScope.launch {
            when (val result = authStrategy.authenticate(credentials)) {
                is AuthResult.Success -> onEvent(AuthEvent.LoginSuccess(result.user))
                is AuthResult.Failure -> onEvent(AuthEvent.LoginFailed(result.message))
            }
        }
    }
}
```

The `transition()` function on the sealed interface is the key insight. By making state transitions explicit and exhaustive, the compiler catches impossible state transitions at compile time. You can't accidentally set the state to `Authenticated` from `LoggedOut` — the transition function simply ignores that event. This eliminates an entire class of bugs that plague codebases using mutable state with no transition rules.

### Template Method — Base Classes and Why to Be Careful

The **Template Method** pattern defines an algorithm skeleton in a base class, letting subclasses override specific steps. In Android, you've seen this with `BaseActivity` and `BaseFragment` patterns — an abstract class that handles common setup and provides hooks for subclasses.

```kotlin
abstract class BaseFragment<VB : ViewBinding> : Fragment() {
    private var _binding: VB? = null
    protected val binding get() = _binding!!

    abstract fun inflateBinding(inflater: LayoutInflater, container: ViewGroup?): VB
    abstract fun setupViews()
    open fun setupObservers() {} // optional hook

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = inflateBinding(inflater, container)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupViews()
        setupObservers()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// Subclass only fills in the specific parts
class ProfileFragment : BaseFragment<FragmentProfileBinding>() {
    override fun inflateBinding(inflater: LayoutInflater, container: ViewGroup?) =
        FragmentProfileBinding.inflate(inflater, container, false)

    override fun setupViews() {
        binding.editButton.setOnClickListener { /* handle click */ }
    }

    override fun setupObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collect { state -> updateUi(state) }
        }
    }
}
```

I need to be honest here — I've grown skeptical of deep `BaseActivity`/`BaseFragment` hierarchies. They violate composition over inheritance, they become dumping grounds for "shared" logic that only 3 out of 20 fragments actually need, and they make debugging harder because behavior is split across multiple classes. A BaseFragment that handles just ViewBinding cleanup (like above) is fine. A BaseFragment with 200 lines of analytics tracking, permission handling, error dialogs, and network state management is a problem.

The modern alternative is **composition** — use extension functions, utility classes, and Compose's composable functions to share behavior without inheritance.

```kotlin
// Instead of BaseFragment doing error handling, use a composable utility
@Composable
fun <T> HandleState(
    state: StateFlow<UiState<T>>,
    onLoading: @Composable () -> Unit = { CircularProgressIndicator() },
    onError: @Composable (String) -> Unit = { ErrorMessage(it) },
    onSuccess: @Composable (T) -> Unit
) {
    when (val current = state.collectAsStateWithLifecycle().value) {
        is UiState.Loading -> onLoading()
        is UiState.Error -> onError(current.message)
        is UiState.Success -> onSuccess(current.data)
    }
}
```

This achieves the same reuse as template method but without forcing an inheritance hierarchy. Each screen opts into the shared behavior it needs rather than inheriting everything from a base class.

## Picking the Right Pattern

The patterns I use most frequently in Android codebases are **Factory** (sealed class factories for creating the right implementation), **Strategy** (swappable behavior behind interfaces, especially with DI), **State** (sealed class state machines in ViewModels), and **Observer** (StateFlow/SharedFlow — you're already using this). The ones I actively avoid writing manually are **Singleton** (let Hilt handle it) and deep **Template Method** hierarchies (prefer composition).

The real skill isn't memorizing pattern definitions — it's recognizing when your code has a structural problem that a pattern solves. If you're writing the same `when` branch in five places, you probably need Strategy. If your ViewModel has 15 boolean flags, you need a State machine. If your tests are impossible to write because everything is tightly coupled, you need Factory and dependency injection. Patterns aren't decoration — they're tools for solving real problems.

Thanks for reading!



