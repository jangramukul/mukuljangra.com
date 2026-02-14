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

It's a fixed-time coding session where I build a feature or small app from scratch, usually in 1-2 hours. I'm either on a video call with the interviewer watching or being recorded. The key difference from a take-home is the time constraint and observation — they see my process, not just the result. Take-homes give 3-7 days and evaluate polished output. Machine coding rounds evaluate how I approach a problem and whether my coding habits are clean even when I'm rushing.

#### What are the common formats?

The main formats are:

- **Build from scratch** — given an API or mock data, build a list screen, detail screen, or form
- **Add a feature to existing code** — given a partially built app, add search, pagination, or a new screen
- **Fix bugs** — the app has intentional bugs (crashes, wrong behavior, memory leaks) and I need to find and fix them
- **Refactor and add tests** — given messy working code, clean it up and add unit tests without breaking behavior

Some companies combine these — fix a bug, add a feature, and write tests, all in 90 minutes.

#### What do evaluators actually watch for?

Process as much as output. They watch how I read requirements — whether I read everything first or jump in. How I structure code — clear architecture vs a monolith. How I debug — reading error messages and tracing the issue vs randomly changing things. How I handle being stuck — staying calm and simplifying vs panicking. And code quality under pressure — naming, separation of concerns, clean structure even when rushing.

A partially working app with clean, well-structured code is better than a fully working app with messy code.

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

Having this pattern memorized saves 10 minutes of setup time. I shouldn't be thinking about how to wire a ViewModel during the round.

#### How should I spend the first 10-15 minutes?

Read the entire problem statement before writing any code. I spend the first 10-15 minutes on:

- Reading all requirements, including the fine print and edge cases
- Identifying the core deliverable — what's the minimum that needs to work
- Planning the architecture — data layer, ViewModel, UI, navigation
- Deciding what I'll skip if time runs short (animations, dark mode, edge cases)

I write a quick mental outline: "Data class, API interface, repository, ViewModel, one composable. That's my first 40 minutes. Tests in the last 20." Having a plan prevents wandering.

#### What's a good time management strategy for a 90-minute round?

I break it into blocks:

- **0-15 minutes** — read requirements, plan architecture, set up project structure and dependencies
- **15-60 minutes** — build the core feature (data layer, ViewModel, main UI screen), get something working end-to-end
- **60-80 minutes** — add secondary features (search, error handling, loading states, navigation to detail)
- **80-90 minutes** — add at least one unit test, clean up code, remove TODO comments

The most common mistake is spending 50 minutes on a perfect data layer and running out of time before the UI works. I get something visible on screen early, then iterate.

#### How do I handle API calls in a timed round?

I set up Retrofit quickly with the provided API documentation. I define only the endpoints I need. No interceptors, logging, or retry logic unless specifically asked.

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

If the API isn't working or the documentation is unclear, I use mock data and move on. I don't waste 20 minutes debugging someone else's API.

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

Material 3's `ListItem` composable is fast to use and looks clean. I don't spend time building custom card layouts unless the requirements specifically ask for it.

#### How do I deal with ambiguous requirements?

I ask questions. In a live round, I ask the interviewer directly. In a recorded round, I document my assumptions. If the requirements say "show a list of users" but don't specify sorting or pagination, I decide what makes sense and add a comment.

```kotlin
// Assumption: Users sorted by name since the requirement
// didn't specify a sort order
val users = repository.getUsers()
    .map { it.sortedBy { user -> user.name } }
```

I pick the simplest reasonable interpretation and move forward. Spending 10 minutes overthinking an ambiguous requirement wastes time.

#### What patterns should I have memorized?

These come up in almost every machine coding round:

- **Sealed interface for UI state** — Loading, Success, Error, Empty
- **Repository with try-catch returning Resource** — catches exceptions, maps to typed results
- **ViewModel with StateFlow** — `stateIn` with `WhileSubscribed(5000)`
- **LazyColumn with key** — `items(items = list, key = { it.id })`
- **Debounced search** — `MutableStateFlow` + `debounce` + `distinctUntilChanged`
- **Navigation with ID passing** — pass IDs through routes, not objects
- **Hilt module** — `@Provides` for Retrofit, Room, repository

Every machine coding task is a combination of these patterns in some configuration. Having them ready saves significant time.

#### How do I add error handling quickly?

I use the `Resource` sealed class pattern and wrap my repository calls. This takes 5 minutes to set up and covers all error cases.

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

The `safeApiCall` helper eliminates duplicate try-catch blocks across every repository method. I set it up once and reuse it.

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

A single passing test demonstrates that my architecture is testable. It shows the evaluator that my ViewModel doesn't have hardcoded dependencies.

#### How do I handle the last 10 minutes?

The last 10 minutes should be cleanup, not feature building. I stop adding new code and focus on:

- Making sure the app compiles and runs without crashes
- Removing TODO comments, unused imports, and dead code
- Adding at least one unit test if I haven't already
- Checking that error states are handled (network off, empty data)

If the app is partially done, I make sure the parts that work are solid. I comment out incomplete features rather than leaving half-written code. A clean, working subset is always better than a complete but buggy mess.

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
