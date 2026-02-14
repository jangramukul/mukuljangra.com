---
title: "Machine Coding Round — What to Expect"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 8
sequence: 76
description: "The machine coding round is a timed, hands-on coding session where you build or modify a feature live, typically in 1-2 hours."
---

## Machine Coding Round — What to Expect

A machine coding round gives you a problem statement and 1-2 hours to build a working solution. Some companies watch you live, others just review the final output.

#### What is a machine coding round and how does it differ from a take-home assignment?

Think of it like a cooking show vs catering. In a take-home (catering), you get 3-7 days and they only judge the final dish. In a machine coding round (cooking show), you have 1-2 hours and the camera is rolling. I'm either on a video call or being recorded, so they see how I read requirements, how I structure code, and whether my habits stay clean under pressure. The time constraint is what makes it a completely different test.

#### What are the common formats?

The main formats are:

- **Build from scratch** — given an API or mock data, build a list screen, detail screen, or form
- **Add a feature to existing code** — given a partially built app, add search, pagination, or a new screen
- **Fix bugs** — the app has intentional bugs (crashes, wrong behavior, memory leaks) and I need to find and fix them
- **Refactor and add tests** — given messy working code, clean it up and add unit tests without breaking behavior

Some companies combine these — fix a bug, add a feature, and write tests, all in 90 minutes.

#### What do evaluators actually watch for?

Here's the thing — process matters as much as output. They're watching how I read requirements (everything first, or did I jump in?), how I structure code (clean layers or one giant ViewModel?), and how I debug (reading error messages vs randomly changing things). They also notice how I handle being stuck — do I simplify and stay calm, or do I panic?

A partially working app with clean, well-structured code beats a fully working app with messy code. Every time.

#### What architecture should I default to?

MVVM with a repository pattern. It's the standard Android architecture and evaluators expect it.

- **UI layer** — Composables that render state, no business logic
- **ViewModel** — Holds `StateFlow` of UI state, calls repository
- **Repository** — Fetches data from API/database, maps DTOs to domain models
- **Data sources** — Retrofit interface for API, Room DAO for local storage

```kotlin
@HiltViewModel
class FeatureViewModel @Inject constructor(
    private val repository: FeatureRepository
) : ViewModel() {
    val uiState: StateFlow<FeatureUiState> = repository.getData()
        .map { result ->
            when (result) {
                is Resource.Success -> FeatureUiState.Success(result.data)
                is Resource.Error -> FeatureUiState.Error(result.message)
                is Resource.Loading -> FeatureUiState.Loading
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), FeatureUiState.Loading)
}
```

I have this pattern memorized cold. It's like a guitarist tuning before a show — I shouldn't be thinking about how to wire a ViewModel when the clock is ticking.

#### How should I spend the first 10-15 minutes?

Read the entire problem statement before writing any code. I spend the first 10-15 minutes on:

- Reading all requirements, including the fine print and edge cases
- Identifying the core deliverable — what's the minimum that needs to work
- Planning the architecture — data layer, ViewModel, UI, navigation
- Deciding what I'll skip if time runs short (animations, dark mode, edge cases)

I write a quick mental outline: "Data class, API interface, repository, ViewModel, one composable. That's my first 40 minutes. Tests in the last 20." Having a plan prevents wandering.

> **🧠 Think about it:** You've got 90 minutes and 5 features listed in the requirements. You can't finish all 5 cleanly. How do you decide which ones to cut?

#### What's a good time management strategy for a 90-minute round?

I break it into blocks:

- **0-15 minutes** — read requirements, plan architecture, set up project structure and dependencies
- **15-60 minutes** — build the core feature (data layer, ViewModel, main UI screen), get something working end-to-end
- **60-80 minutes** — add secondary features (search, error handling, loading states, navigation to detail)
- **80-90 minutes** — add at least one unit test, clean up code, remove TODO comments

The biggest trap? Spending 50 minutes perfecting the data layer and running out of time before anything shows up on screen. I get something visible early, then iterate. A working skeleton you can polish beats a perfect foundation with no roof.

#### How do I handle API calls in a timed round?

I set up Retrofit fast with only the endpoints I actually need. No interceptors, no logging, no retry logic — unless specifically asked.

```kotlin
interface TaskApi {
    @GET("tasks")
    suspend fun getTasks(): List<TaskDto>

    @POST("tasks")
    suspend fun createTask(@Body task: CreateTaskRequest): TaskDto
}

val api = Retrofit.Builder()
    .baseUrl(BASE_URL)
    .addConverterFactory(MoshiConverterFactory.create())
    .build()
    .create(TaskApi::class.java)
```

Plot twist: if the API isn't working or the docs are unclear, I switch to mock data and move on. I'm not going to waste 20 minutes debugging someone else's API on my time.

#### How do I display a list quickly in Compose?

This is the most common UI requirement. I have the `LazyColumn` pattern ready so I can set it up in under 5 minutes.

```kotlin
@Composable
fun TaskListScreen(
    uiState: TaskUiState,
    onTaskClick: (Long) -> Unit
) {
    when (uiState) {
        is TaskUiState.Loading -> CircularProgressIndicator()
        is TaskUiState.Error -> Text("Error: ${uiState.message}")
        is TaskUiState.Success -> {
            LazyColumn {
                items(items = uiState.tasks, key = { it.id }) { task ->
                    ListItem(
                        headlineContent = { Text(task.title) },
                        supportingContent = { Text(task.description) },
                        modifier = Modifier.clickable { onTaskClick(task.id) }
                    )
                }
            }
        }
    }
}
```

Material 3's `ListItem` composable is fast and looks clean out of the box. I don't spend time building custom card layouts unless the requirements specifically ask for it.

#### How do I deal with ambiguous requirements?

I ask questions. In a live round, I ask the interviewer directly. In a recorded round, I document my assumptions as comments in the code. If the requirements say "show a list of users" but don't mention sorting or pagination, I pick what makes sense and leave a note.

```kotlin
// Assumption: sorting by name since requirements
// didn't specify a sort order
val users = repository.getUsers()
    .map { it.sortedBy { user -> user.name } }
```

I pick the simplest reasonable interpretation and move forward. Overthinking an ambiguous requirement for 10 minutes is like debating which lane to take while the highway exit passes you by.

#### What patterns should I have memorized?

These come up in almost every machine coding round:

- **Sealed interface for UI state** — Loading, Success, Error, Empty
- **Repository with try-catch returning Resource** — catches exceptions, maps to typed results
- **ViewModel with StateFlow** — `stateIn` with `WhileSubscribed(5000)`
- **LazyColumn with key** — `items(items = list, key = { it.id })`
- **Debounced search** — `MutableStateFlow` + `debounce` + `distinctUntilChanged`
- **Navigation with ID passing** — pass IDs through routes, not objects
- **Hilt module** — `@Provides` for Retrofit, Room, repository

Every machine coding task is just these patterns shuffled into a different configuration. It's like knowing your chord shapes on guitar — once you have them memorized, you can play almost any song.

#### How do I add error handling quickly?

I use the `Resource` sealed class pattern and wrap every repository call. It takes about 5 minutes to set up and covers all error cases.

```kotlin
sealed interface Resource<out T> {
    data class Success<T>(val data: T) : Resource<T>
    data class Error(val message: String) : Resource<Nothing>
    data object Loading : Resource<Nothing>
}

suspend fun <T> safeApiCall(call: suspend () -> T): Resource<T> {
    return try {
        Resource.Success(call())
    } catch (e: HttpException) {
        Resource.Error("Server error: ${e.code()}")
    } catch (e: IOException) {
        Resource.Error("No internet connection")
    } catch (e: Exception) {
        Resource.Error(e.message ?: "Unknown error")
    }
}

class TaskRepository(private val api: TaskApi) {
    suspend fun getTasks(): Resource<List<Task>> = safeApiCall {
        api.getTasks().map { it.toDomain() }
    }
}
```

The `safeApiCall` helper eliminates duplicate try-catch blocks across every repository method. Write it once, reuse it everywhere.

> **🧠 Think about it:** Your app works perfectly on Wi-Fi. Now the evaluator turns airplane mode on. Does your app crash, hang, or show a clean error message?

#### What should I NOT do in a machine coding round?

- **Don't over-engineer** — don't add use cases, mappers, and six layers of abstraction for a two-screen app
- **Don't copy-paste from templates blindly** — if asked, I need to explain every line
- **Don't ignore the error path** — an app that crashes on network failure looks worse than one that shows a simple error message
- **Don't spend time on styling** — Material defaults look fine. Custom colors, fonts, and animations are wasted time unless specifically requested
- **Don't leave the app in a non-compiling state** — if time's running out, I cut features, not stability
- **Don't forget tests** — even one or two ViewModel tests show testing awareness

#### How do I write a quick unit test when time is short?

I test the ViewModel's happy path. If I only have time for one test, I test that the ViewModel correctly maps repository data to UI state.

```kotlin
@Test
fun `loads tasks successfully`() = runTest {
    val repository = FakeTaskRepository()
    repository.setTasks(listOf(Task(id = 1, title = "Buy milk")))
    val viewModel = TaskViewModel(repository)

    val state = viewModel.uiState.first { it is TaskUiState.Success }
    val success = state as TaskUiState.Success
    assertThat(success.tasks).hasSize(1)
    assertThat(success.tasks[0].title).isEqualTo("Buy milk")
}

class FakeTaskRepository : TaskRepository {
    private val tasks = MutableStateFlow<List<Task>>(emptyList())

    fun setTasks(list: List<Task>) { tasks.value = list }

    override fun getTasks(): Flow<Resource<List<Task>>> =
        tasks.map { Resource.Success(it) }
}
```

A single passing test does two things — it proves my architecture is testable and it shows the evaluator that my ViewModel doesn't have hardcoded dependencies baked in.

#### How do I handle the last 10 minutes?

The last 10 minutes are for cleanup, not new features. I stop writing new code and focus on:

- Making sure the app compiles and runs without crashes
- Removing TODO comments, unused imports, and dead code
- Adding at least one unit test if I haven't already
- Checking that error states are handled (network off, empty data)

If the app is partially done, I make sure the parts that work are solid. I comment out incomplete features rather than leaving half-written code. A clean, working subset is always better than a complete but buggy mess.

> **🧠 Think about it:** You have 8 minutes left and two features half-done. Do you try to finish both, or do you cut one and polish the other?

#### What separates a strong submission from an average one?

Average submissions have the feature working but with everything crammed into one ViewModel, no error handling, and no tests. Strong submissions have:

- Clean separation between data, domain, and UI layers
- A sealed UI state class with Loading, Success, Error, and Empty states
- At least basic error handling (try-catch in repository, error UI in composable)
- One or two unit tests for the ViewModel
- Consistent naming and code style
- Small, focused functions instead of 50-line methods

I don't need every feature. I need the features I built to be clean, correct, and well-structured.

### Common Follow-ups

- How do you prepare for a machine coding round if you haven't done one before?
- What IDE shortcuts or live templates save the most time during a timed round?
- How do you decide between Compose and XML views in a timed round?
- What do you do if the provided API is down or returns unexpected data?
- How do you handle a machine coding round where the requirements change mid-session?
- What's your approach if you realize you chose the wrong architecture halfway through?
- How do you practice machine coding rounds on your own?
