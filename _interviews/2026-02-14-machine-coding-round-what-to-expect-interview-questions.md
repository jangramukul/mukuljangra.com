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

The machine coding round is a timed, hands-on coding session. You get a problem statement and 1-2 hours to build a working solution. Some companies watch you live, others record the session, and some just review the final output. It tests how you think, debug, and write code under real time pressure.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a machine coding round and how does it differ from a take-home assignment?

A machine coding round is a fixed-time coding session, usually 1-2 hours, where you build a feature or small app from scratch. You're either on a video call with the interviewer watching, or you're recorded. The key difference from a take-home is the time constraint and observation — they can see your process, not just the result.

Take-homes give you 3-7 days and evaluate the polished output. Machine coding rounds evaluate how you approach a problem, how you prioritize under pressure, and whether your coding habits are clean even when you're rushing.

#### Q2: What are the common formats of a machine coding round?

The main formats are:

- **Build a small feature from scratch** — given an API or mock data, build a list screen, detail screen, or form with specific requirements
- **Add a feature to an existing codebase** — you're given a partially built app and need to add search, pagination, offline caching, or a new screen
- **Fix bugs in existing code** — the app has intentional bugs (crashes, wrong behavior, memory leaks) and you need to find and fix them
- **Refactor and add tests** — given messy working code, clean it up and add unit tests without breaking existing behavior

Some companies combine these — fix a bug, add a feature, and write tests, all in 90 minutes.

#### Q3: How should you spend the first 10-15 minutes?

Read the entire problem statement before writing any code. Most candidates start coding immediately and miss requirements that change their approach. Spend the first 10-15 minutes on:

- Read all requirements, including the fine print and edge cases
- Identify the core deliverable — what's the minimum that needs to work
- Plan your architecture — data layer, ViewModel, UI, navigation
- Decide what you'll skip if time runs short (animations, dark mode, edge cases)

Write a quick mental outline: "Data class, API interface, repository, ViewModel, one composable. That's my first 40 minutes. Tests in the last 20." Having a plan prevents wandering.

#### Q4: What do evaluators actually watch for?

Evaluators care about process as much as output. They watch:

- **How you read requirements** — do you read everything first or jump in and discover things later?
- **How you structure code** — do you start with a clear architecture or build a monolith and refactor later?
- **How you debug** — when something breaks, do you read the error message, add logs, and trace the issue? Or do you randomly change things?
- **How you handle being stuck** — do you stay calm, simplify the problem, or panic and rewrite everything?
- **Code quality under pressure** — naming, separation of concerns, and clean structure even when rushing

A working app with messy code is worse than a partially working app with clean, well-structured code. They want to see how you'd write production code, not hackathon code.

#### Q5: What's a good time management strategy for a 90-minute round?

Break it into three blocks:

- **0-15 minutes** — read requirements, plan architecture, set up the project structure and dependencies
- **15-60 minutes** — build the core feature (data layer, ViewModel, main UI screen). Get something working end-to-end
- **60-80 minutes** — add secondary features (search, error handling, loading states, navigation to detail)
- **80-90 minutes** — add at least one unit test, clean up code, remove TODO comments

The most common mistake is spending 50 minutes on a perfect data layer and running out of time before the UI works. Get something visible on screen early, then iterate.

#### Q6: What architecture should you default to?

MVVM with a repository pattern. It's the standard Android architecture and evaluators expect it. Set up these layers:

- **UI layer** — Composables that render state, no business logic
- **ViewModel** — Holds `StateFlow` of UI state, calls repository
- **Repository** — Fetches data from API/database, maps DTOs to domain models
- **Data sources** — Retrofit interface for API, Room DAO for local storage

```kotlin
// This is your starting template for any machine coding round
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

Having this pattern memorized saves 10 minutes of setup time. You shouldn't be thinking about how to wire a ViewModel during the round.

#### Q7: How do you handle API calls in a timed round?

Set up Retrofit quickly with the provided API documentation. Define only the endpoints you need. Don't spend time building interceptors, logging, or retry logic unless specifically asked.

```kotlin
interface TaskApi {
    @GET("tasks")
    suspend fun getTasks(): List<TaskDto>

    @POST("tasks")
    suspend fun createTask(@Body task: CreateTaskRequest): TaskDto
}

// Quick Retrofit setup — no extras
val api = Retrofit.Builder()
    .baseUrl(BASE_URL)
    .addConverterFactory(MoshiConverterFactory.create())
    .build()
    .create(TaskApi::class.java)
```

If the API isn't working or the documentation is unclear, use mock data and move on. Don't waste 20 minutes debugging someone else's API.

#### Q8: How do you display a list quickly in Compose?

This is the most common UI requirement. Have the `LazyColumn` pattern ready so you can set it up in under 5 minutes.

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

Material 3's `ListItem` composable is fast to use and looks clean. Don't spend time building custom card layouts unless the requirements specifically ask for it.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you deal with ambiguous requirements?

Ask questions. In a live round, you can ask the interviewer directly. In a recorded round, document your assumptions. If the requirements say "show a list of users" but don't specify sorting, pagination, or error handling, decide what makes sense and add a comment.

```kotlin
// Assumption: Users are sorted by name alphabetically
// since the requirement didn't specify a sort order
val users = repository.getUsers()
    .map { it.sortedBy { user -> user.name } }
```

Making and documenting reasonable assumptions shows product sense. Spending 10 minutes overthinking an ambiguous requirement wastes time. Pick the simplest reasonable interpretation and move forward.

#### Q10: What are common patterns you should have memorized?

These patterns come up in almost every machine coding round. Having them ready saves significant time:

- **Sealed interface for UI state** — Loading, Success, Error, Empty
- **Repository with try-catch returning Resource** — catches exceptions, maps to typed results
- **ViewModel with StateFlow** — `stateIn` with `WhileSubscribed(5000)`
- **LazyColumn with key** — `items(items = list, key = { it.id })`
- **Debounced search** — `MutableStateFlow` + `debounce` + `distinctUntilChanged`
- **Navigation with ID passing** — pass IDs through routes, not objects
- **Hilt module** — `@Provides` for Retrofit, Room, repository

These are the building blocks. Every machine coding task is a combination of these patterns in some configuration.

#### Q11: When should you ask questions vs make assumptions?

Ask questions when the answer significantly changes your implementation. Ask about: which API endpoints to use, whether offline support is expected, whether you should use Compose or XML, and what the minimum deliverable is.

Don't ask about obvious things like "should I handle null?" or "should I use MVVM?" These waste time and signal uncertainty. For anything that's genuinely ambiguous but won't change your architecture, make an assumption, document it, and keep moving.

#### Q12: What should you NOT do in a machine coding round?

Avoid these common mistakes:

- **Don't over-engineer** — don't add use cases, mappers, and six layers of abstraction for a two-screen app. Clean code doesn't mean maximum abstraction
- **Don't copy-paste from templates blindly** — evaluators can tell when you paste a pre-built module without understanding it. If asked, you need to explain every line
- **Don't ignore the error path** — an app that crashes on network failure looks worse than one that shows a simple error message
- **Don't spend time on styling** — Material defaults look fine. Custom colors, fonts, and animations are wasted time unless specifically requested
- **Don't leave the app in a non-compiling state** — if time's running out, cut features, not stability. A working subset is better than a complete but broken app
- **Don't forget tests** — even one or two ViewModel tests show testing awareness. Zero tests signals that you don't test in real projects either

#### Q13: How do you add error handling quickly?

Use the `Resource` sealed class pattern and wrap your repository calls. This takes 5 minutes to set up and covers all your error cases.

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

// Usage in repository
class TaskRepository(private val api: TaskApi) {
    suspend fun getTasks(): Resource<List<Task>> = safeApiCall {
        api.getTasks().map { it.toDomain() }
    }
}
```

The `safeApiCall` helper function eliminates duplicate try-catch blocks across every repository method. Set it up once and reuse it.

#### Q14: What do real machine coding rounds look like at different companies?

Formats vary, but here are common patterns:

- **Startups** — build a small app from scratch in 2 hours. Usually a list + detail + form. They want to see full-stack Android skills.
- **Mid-size companies** — given an existing project, add a feature (search, pagination, new screen). They want to see how you work with existing code.
- **Large companies (Google, Meta)** — more structured. Might be a pair-programming session where you build a feature with the interviewer. They give hints and watch how you collaborate.
- **Some companies** — provide a pre-built project with bugs and ask you to fix them, add tests, and refactor. This tests debugging and code quality skills.

The time limit is usually 60-120 minutes. Some allow you to use any libraries you want, others restrict you to specific ones. Always check if there are constraints before starting.

#### Q15: How do you handle the last 10 minutes?

The last 10 minutes should be cleanup and polish, not feature building. Stop adding new code and focus on:

- Make sure the app compiles and runs without crashes
- Remove TODO comments, unused imports, and dead code
- Add at least one unit test if you haven't already
- Check that error states are handled (network off, empty data)
- Write a brief README if the submission format requires it

If the app is partially done, make sure the parts that work are solid. Comment out incomplete features rather than leaving half-written code. A clean, working subset is always better than a complete but buggy mess.

#### Q16: How do you write a quick unit test when time is short?

Test the ViewModel's happy path. If you only have time for one test, test that the ViewModel correctly maps repository data to UI state.

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

A single passing test demonstrates that your architecture is testable. It shows the evaluator that your ViewModel doesn't have hardcoded dependencies that prevent testing.

#### Q17: How do you set up a project quickly from scratch?

Have a mental checklist for project setup:

- Create a new Android project with Compose template
- Add dependencies: Hilt, Retrofit, Moshi, Room, Navigation Compose, Coil (if images)
- Create the package structure: `data/`, `domain/`, `ui/`, `di/`
- Set up the Hilt Application class and annotate `MainActivity` with `@AndroidEntryPoint`
- Create the data model, API interface, and repository
- Create the ViewModel with sealed UI state
- Build the first composable screen

If you've done this a few times, the setup takes 10-15 minutes. Practice it beforehand — fumbling with Gradle dependencies under time pressure is frustrating and wastes valuable minutes. Keep a reference note with the latest dependency versions you use regularly.

#### Q18: What separates a strong submission from an average one?

Average submissions have the feature working but with everything crammed into one ViewModel, no error handling, and no tests. Strong submissions have:

- Clean separation between data, domain, and UI layers
- A sealed UI state class with Loading, Success, Error, and Empty states
- At least basic error handling (try-catch in repository, error UI in composable)
- One or two unit tests for the ViewModel
- Consistent naming and code style
- Small, focused functions instead of 50-line methods

You don't need every feature. You need the features you built to be clean, correct, and well-structured. Evaluators look at five files and form an opinion in under a minute. Make those files count.

### Common Follow-ups

- How do you prepare for a machine coding round if you haven't done one before?
- What IDE shortcuts or live templates save the most time during a timed round?
- How do you decide between Compose and XML views in a timed round?
- What do you do if the provided API is down or returns unexpected data?
- How do you handle a machine coding round where the requirements change mid-session?
- What's your approach if you realize you chose the wrong architecture halfway through?
- How do you practice machine coding rounds on your own?
