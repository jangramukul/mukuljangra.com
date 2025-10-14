---
title: Compose Beyond The UI?
layout: post
categories: post
tags:
  - Android
  - Kotlin
---

A few years ago, I remember managing almost everything with `Threads`, `AsyncTask`, and `Handlers` for background tasks and UI updates. It was quite messy, specifically writing business logic.

With RxJava, it gave quite a nice way to handle asynchronous tasks with its lots of operators. It could map, filter, and combine streams of data. For years, this was the preferred way to write presenters and viewmodels. The major problem with RxJava was, business logic was lost in the sea of complex operators.

Around 2017, Google released LiveData as part of its Architecture Components. It was a simpler and lifecycle-aware solution. It reduced the risk of memory leaks and wasted resources. But at the same time, it was missing lots of operators like RxJava had.

The next big shift was Kotlin Coroutines. In 2020, we got StateFlow and SharedFlow. StateFlow quickly became the preferred way over LiveData. It was lifecycle-aware if combined with supported APIs, it integrated nicely with Coroutines, and it came with lots of operators. Because it was part of Kotlin, it felt more natural and simpler than RxJava. But it solved the major problem of complex layers of state management that came with RxJava.

Throughout this time, until about 2021, we were using XML for UI. This worked perfectly with the ViewModel or presenters pattern. Our XML-based UI was stateless and largely state was defined in ViewModel or presenters.

Then, Jetpack Compose arrived. Compose made writing UI cleaner, more concise, and declarative. But what was once very simple in XML, like initializing a ViewModel or managing a text field's state, could now feel more complex in Compose. We had to learn new rules to avoid side-effects and understand how state flowed through composable functions. Still to this day, the architecture decision of managing few things feels like a downgrade. Even recompositions, managing field states etc. feels more complex which were quite easy in XML. But definitely, there're lots of nice things from Compose which has made writing clean UI by reducing the complex layers.

Now, after the traditional ways of writing viewmodel or presenters using coroutines seems evolution and new architecture and patterns seems floating around like Circuit, Molecule etc. Let's discuss the problem first and then explore the solutions.

### What's the Problem?

As apps grow, their ViewModels or Presenters become huge because of multiple states and UI events which makes the code difficult to read and reduces the code longevity. UDF is useful because it simplifies how state and events should flow and in what direction, but it doesn't automatically solve all the problems that come with complex screens while writing the pipeline.

Compose itself has two parts, which is compose runtime and UI. Indeed, Compose is not just used for UI, even this is called in other places too. There're other libraries like Circuit (also named as circuit architecture) from Slack, Molecule from Cash App which tried to solve this. IMO, these are trying to solve two major problems while using compose UI: how we can properly separate states and UI in a cleaner way and can create a better pluggable UI. Second is, how we can reduce the complexity of writing business logic in viewmodel.

These tried to reduce the complexity of writing business logic that comes with traditional code in viewmodel and coroutines. But I would argue that testing the business logic if written using compose states or these libraries can be a bit tricky than traditional viewmodel code. Turbine library is one of them, which can definitely help in easier testing.

Cash App has been using presenters (MVP instead of MVVM) for writing the business logic for UI. Simply because presenters just make sense and feels a bit clean and UDF also seems very clear. Initially during the days of Rx, they were used to write presenters with RxJava. Later, moved to coroutines and flow. Now, writing it in compose code seems much cleaner, even than coroutines. Here, I wouldn't go into ViewModel vs presenter. But I would explain the different ways to write the business and the compose way :)

To me, using the compose runtime like compose states in viewmodel or presenters itself doesn't seem a bad practice or anti-pattern or any bad architectural decision because clearly fundamentally, compose runtime and UI has been clearly separated from the bottom.

### Ways To Write ViewModel

Right now, there are a few traditional common patterns and ways we write our viewmodel. Let's explore these and understand their pros and cons. And later, let's see if there's anything beyond we can go further. You could skip this part if you're only interested in new architecture instead of traditional viewmodel.

#### Single Field Class

This approach uses individual `StateFlow` fields for each piece of data. Back in few years, this worked well with XML-based view components. It worked well to render the component when a specific state field changed instead of updating the entire hierarchy or entire tree in case when UI state class used. It worked well also in case when you need to filter out a single state or combine one with another state.

The main problem with this pattern is that it leads to a proliferation of fields and methods, making the state difficult to reason about as a whole as your screen grows.

> **Note**: The pipeline assembly must be **lifecycle aware**. Use `collectAsStateWithLifecycle()` in the UI to collect state or `SharingStarted.WhileSubscribed()` while using `stateIn` or `shareIn` in viewmodel to avoid leaking resources.

```groovy
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
	val username by viewModel.username.collectAsStateWithLifecycle()
	
	Text(
	  modifier = Modifier,
	  text = username,
	)
}

class LoginViewModel: ViewModel() {
    private val _username = MutableStateFlow<String?>("")
    val username = _username.asStateFlow()
    
    private val _name = MutableStateFlow<String?>("")
    val name = _name.asStateFlow()

    fun updateUsername(value: String) {
	  _username.value = value  
    }
    
    fun updateName(value: String) {
	  _name.value = value 
    }
}
```

#### UI State Class

In this, a more structured method that groups all state into a single data class. I think, for small screens, it fits very well and should be the preferred solution for small and medium-size screens. There're few issues I can see with this approach. If I've complex logic for filtering and mapping states or fields, it could become complex and doesn't give enough flexibility. For better abstraction, we could create inner classes inside UI state class like grouping few fields and mutating.

But make sure, if you're passing down the UI State class down to composable functions which I'm sure it will, make sure to use `@Stable` to achieve recomposition safety and avoid direct updating the state without using update function for thread safety. You could inject the entire initial UI state class for easier testing. And it's better to use lifecycle API while collecting the state over the UI to avoid wasting resources and unexpected side effects. Please check [Jetpack Compose Strong Skipping Mode Explained](https://medium.com/androiddevelopers/jetpack-compose-strong-skipping-mode-explained-cbdb2aa4b900) to learn more.

Also, one more problem with this approach is, if I've multiple input sources like observing users from repository or usecase, it could be hard to mutate the state. We need to collect first and then mutate the state. So this works well if the screen is not complex or doesn't involve multiple SSOT from network or database or any complex mapping or filtering logics or checks.

> **Warning**: A critical pitfall to avoid is launching coroutines or performing asynchronous operations in an `init` block because these operations can run before the object is fully initialized, which may throw an `IllegalStateException` when using Compose State.

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
	val state by viewModel.uiState.collectAsStateWithLifecycle()
	
	Text(
	   modifier = Modifier,
	   text = state.username,
	)
}

@Stable
data class LoginUiState(
   val username: String, 
   val name: String,
   val totalUsers: Int,
)

class LoginViewModel(
    private val observeUsers: ObserveUsers
): ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val uiState = _state.asStateFlow()
    
    init {
        viewModelScope.launch {
            observeUsers().collectLatest { users ->
                _state.update {
                    it.copy(totalUsers = users.size)
                }
            }
        }
    }
    
    fun updateUsername(value: String) {
        _state.update { it.copy(username = value) }
    }
}
```

#### Single Field States + Combine

This technique combines multiple streams of data into a single UI state output. This is very similar as above as it exposes a UI state class like above. The only difference is that it combines multiple stateflows using `combine` function and then creating a UI state class. This solves one problem if we need to filter or observe individual fields. But creates another problem because having multiple state flows for each field which can be quite complex for large screens. (Note: Single value from UI state class can also be observed or collected using `distinctUntilChanged()`)

A major pitfall of the `combine` function is that it only supports a limited number of flows directly (5). While you can create custom combiners, combining 5-7 or more flows, which is quite normal for a complex screen, makes the code very complex and difficult to read and maintain. Of course, further, you could also create inner classes inside your state class for reducing the complexity. But still, it won't reduce the business logic complexity.

This approach works well when we have mapping or filtering logic or checks in place, including if we have multiple sources of input like observing users or favorite books from usecase or repository.

> **Note:** Use `SavedStateHandle` to retain data, like user IDs, during configuration changes like orientation shifts and, specifically, for process death. Also, StateFlow can handle process death if used with SavedStateHandle and when it comes to `mutableStateOf` or compose state, `rememberSaveable` can be used for both process death or configuration changes retention.
> 
> To avoid leaking the resources during the collection of upstream flow, we've passed viewModelScope and sharing strategy in stateIn. (`stateIn` is used for converting the cold flow returned from `combine()` to hot stateflow)

```kotlin
@Stable
data class LoginUiState(
	val username: String, 
	val name: String,
)

class LoginViewModel(
	private val observeUser: ObserveUser,
) : ViewModel() {
    private val _username = MutableStateFlow<String?>("")
    private val _name = MutableStateFlow<String?>("")

    val uiState = combine(
	    _username, 
	    _name,
	    observeUser(),
    ) { username, name, user ->
        LoginUiState(
	        username = username ?: "", 
	        name = name ?: user.name,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = LoginUiState.Loading
    )
}
```

#### The Compose Way

This approach works well only in compose-based UI. There are multiple ways we can use compose states in viewmodel or presenters which is much cleaner than traditional viewmodels or presenters. A viewmodel or presenter can have compose states only, or both compose states and coroutines flow.

One practical reason I've found for using compose state in viewmodel is that the compose text field API works well with direct compose state instead of any StateFlow. The major problem when it comes to compose text API is, it's difficult to sync the state between the viewmodel and UI in realtime without any delays if compose state is not used. There are many articles and talks discussing this problem. Here's an example:

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    TextField(
        value = viewModel.username,
        onValueChange = { viewModel.username = it },
        //...
    )
    
    TextField(
        value = viewModel.password,
        onValueChange = { viewModel.password = it },
        //...
    )
}

class LoginViewModel(
    private val repository: LoginRepository,
) : ViewModel() {
    var username by mutableStateOf("")
        private set
    var password by mutableStateOf("")
        private set
        
    val isUsernameValid by derivedStateOf {
        repository.isUsernameValid(username)
    }
        
    val isPasswordValid: StateFlow<Boolean> =
        snapshotFlow { password }
            .mapLatest { repository.isPasswordValid(it) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = false
            )
    
    fun login() {
        viewModelScope.launch {
            // login
        }
    }
}
```

When required to convert any compose state to flow, `snapshotFlow` can be used. When this is paired with `stateIn`, it can be converted to hot StateFlow (see the above example). Also, `derivedStateOf` is used for safely producing derived state. Please check [this article](https://medium.com/androiddevelopers/jetpack-compose-when-should-i-use-derivedstateof-63ce7954c11b) to learn more about when to use it. Also, Updating compose state from a background thread is risky. For guaranteed atomic updates and thread safety when using Compose State, please use `Snapshot.withMutableSnapshot`.

```kotlin
class LoginViewModel(
    private val defaultDispatcher: Dispatcher    
) : ViewModel() {
    var isLoggedIn by mutableStateOf(false)
        private set
        
    fun login() {
        viewModelScope.launch {
            withContext(defaultDispatcher) {
                Snapshot.withMutableSnapshot {
                    isLoggedIn = true
                }
            }
        }
    }
}
```

#### Any Benefits?
The real benefits come when compose states are combined with the recomposition part, instead of just writing compose state fields in viewmodel. Business logic written in compose way is much cleaner than traditional viewmodel with coroutines. One example is retaining values during process-death – using compose state with `rememberSaveable` is much cleaner and simpler than using flows with `SavedStateHandle`. For example, If we write the presenter in traditional way:

```kotlin
class Presenter() {
    private val stateFlow = MutableStateFlow<State>()
    
    fun state(): StateFlow<State> {
        scope.launch {
            events.collectLatest { event ->
                stateFlow.update { it.copy(search = event.query) }
            }
        }
        return stateFlow
    }
}
```

This could be replaced with something much simpler, cleaner, and more readable if we write it in compose way :) You could write the same using Molecule or Circuit. Please check their official documentation for more details.

```kotlin
class Presenter() {
    @Composable
    fun state(): State {
        var query by remember { mutableStateOf("") }
        
        return State(search = query) { event ->
            query = event.query
        }
    }
}
```

You could do similar thing with Molecule, FYI, It allows you to build a `StateFlow` or `Flow` stream using Compose's runtime. Here you would see `launchMolecule` function launches a coroutine that continually recomposes the body to produce a StateFlow stream of values. Here are a few examples If you want to check them out:

```kotlin
class LoginViewModel: ViewModel() {
    private val usernameState = mutableStateOf("")
    private val nameState = mutableStateOf("")
    private val passwordState = MutableStateFlow("")
    
    // Example 1: Using state from ViewModel
    val uiState: StateFlow<UiState> = viewModelScope.launchMolecule(mode = ContextClock) {
        val username by usernameState
        val name by nameState
        val password by passwordState.collectAsState()
        
        UiState(
            username = username, 
            name = name, 
            password = password,
        )
    }
    
    // Example 2: Using remember and side effects internally
    val uiState2: StateFlow<UiState> = viewModelScope.launchMolecule(mode = ContextClock) {
        var username by remember { mutableStateOf("") }
        
        LaunchedEffect(Unit) {
            // side effect also possible
        }
        
        UiState(username = username, ...)
    }
}
```

The compose way definitely makes the code much cleaner. But there are some trade-offs. Testing presenters or viewmodels written with Molecule requires understanding of Turbine or similar libraries to test flows properly. Though once you set it up, it's not too bad.

To me, using the compose runtime like compose states in viewmodel or presenters itself doesn't seem a bad practice or anti-pattern or any bad architectural decision because clearly, fundamentally, compose runtime and UI have been separated from the bottom. Jake Wharton has written extensively about this separation in his post "A Jetpack Compose by any other name." if you want to read more.

Thanks for reading through all of this 🙂, Happy Coding!
