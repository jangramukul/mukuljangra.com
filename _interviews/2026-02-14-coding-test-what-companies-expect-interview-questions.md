---
title: "Coding Test — What Companies Expect"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 1
sequence: 69
description: "Most Android interview pipelines include a practical coding test — either a take-home project or a live coding session."
---

## Coding Test — What Companies Expect

Most Android interview pipelines include a coding test — either a take-home project or a live coding session. Knowing what evaluators look for matters as much as knowing how to code.

#### What are the common coding test formats?

There are three main formats. Timed take-home is the most common — I get a problem statement and 3-6 hours to build a solution. Untimed take-home gives a few days with no strict time limit, but evaluators still gauge effort by scope. Live coding puts me on a shared screen with an interviewer — I build or modify something in real time while explaining my thought process.

Some companies also do "fix and extend" — they hand me an existing codebase with bugs or missing features, and I need to fix issues, add a feature, and improve code quality.

#### What do evaluators look for in a submission?

Five things, roughly in this priority:

- **Code quality** — clean naming, short functions, no dead code
- **Architecture** — separation of concerns, proper layering (UI, domain, data), dependency direction
- **Error handling** — network failures, empty states, edge cases handled gracefully
- **Testing** — at least unit tests for repository and ViewModel
- **Documentation** — a clear README explaining how to build, run, and navigate the project

A working app with poor architecture scores lower than a well-architected app missing a minor feature.

#### What should a good README contain?

A good README covers four things: how to build and run (including any API key setup), architecture decisions and why I made them, what I would improve with more time, and any assumptions I made about ambiguous requirements.

I keep it to 200-400 words. Evaluators read dozens of submissions, so a concise README that highlights my thinking beats a long one that restates the obvious.

#### How important is Git history?

More important than most candidates realize. Evaluators check commit history to understand how I work. A single "initial commit" with everything tells them nothing. Small, logical commits like "set up project structure", "add Retrofit API client", "implement weather repository with caching", "add unit tests for repository" show incremental, organized thinking.

I don't rewrite history to look perfect — that feels dishonest. But I commit at natural breakpoints instead of dumping everything at the end.

#### How should I structure a coding test project?

I use a standard Android project structure with clear package separation. At minimum, I separate code into `data`, `domain`, and `ui` packages. Inside each, I group by feature when the project has more than one screen.

```
com.example.weatherapp/
├── data/
│   ├── remote/        // API service, DTOs
│   ├── local/         // Room database, DAOs
│   └── repository/    // Repository implementations
├── domain/
│   ├── model/         // Domain models
│   └── usecase/       // Use cases (if needed)
├── ui/
│   ├── home/          // HomeScreen, HomeViewModel
│   └── detail/        // DetailScreen, DetailViewModel
└── di/                // Hilt modules
```

If the project is simple enough that use cases add nothing, I skip the domain layer and go straight from ViewModel to repository. Don't create empty layers just for show.

#### Should I use Jetpack Compose or XML Views?

I use whatever I'm stronger in, unless the job description specifically mentions one. If the company uses Compose, I go with Compose — it signals that I'm current. If I'm comfortable with both, Compose is generally the better choice because it's less boilerplate.

I don't mix both in the same project. That looks scattered, not versatile.

#### What are the most common mistakes in coding tests?

- No error handling — the app crashes on network failure or shows a blank screen
- No tests — not even a single unit test for the repository or ViewModel
- Over-engineering — creating abstractions that don't add value in a small project
- No README — evaluators shouldn't have to read my code to understand the project
- Hardcoded API keys — I use `local.properties` or `BuildConfig` instead
- Ignoring edge cases — empty lists, no network, invalid input
- Code that doesn't compile — I always do a clean build from a fresh checkout before submitting

#### How should I handle ambiguous requirements?

I document my assumptions and move on. If the requirements say "build a weather app" but don't specify whether to show a 5-day forecast or just current weather, I pick one, build it well, and note my assumption in the README.

If the company allows questions, I ask two or three clarifying questions before starting — like what API to use, whether offline support is expected, and whether Compose or XML is preferred.

#### How should I manage time in a timed take-home test?

I split my time roughly into thirds. First third for setup, architecture, and API integration — get data flowing end to end. Second third for UI, error handling, and edge cases. Final third for testing, cleanup, and README.

The biggest mistake is spending too long on UI polish or animations. A clean, functional app with proper architecture and tests scores better than a pixel-perfect app with no error handling.

#### What does good architecture look like for a small coding test app?

A clean single-module MVVM setup with repository pattern. I don't need Clean Architecture with use cases for a 2-3 screen app. The key is clear dependency direction — ViewModel depends on Repository, Repository depends on API service and DAO, but nothing depends on the ViewModel.

```kotlin
class WeatherRepository(
    private val api: WeatherApi,
    private val dao: WeatherDao
) {
    fun getWeather(city: String): Flow<Resource<Weather>> = flow {
        emit(Resource.Loading)
        val cached = dao.getWeather(city)
        if (cached != null) emit(Resource.Success(cached.toDomain()))

        try {
            val remote = api.getWeather(city)
            dao.insertWeather(remote.toEntity())
            emit(Resource.Success(remote.toDomain()))
        } catch (e: Exception) {
            if (cached == null) emit(Resource.Error(e.message ?: "Unknown error"))
        }
    }
}
```

I use Hilt for DI — it takes 10 minutes to set up and shows I understand dependency management. Manual DI is fine too, but Hilt is expected at most companies.

#### How should I implement error handling?

I use a sealed interface for UI state that covers loading, success, and error. The ViewModel exposes this state and the UI renders accordingly.

```kotlin
sealed interface WeatherUiState {
    data object Loading : WeatherUiState
    data class Success(val weather: Weather) : WeatherUiState
    data class Error(val message: String) : WeatherUiState
}

class WeatherViewModel(
    private val repository: WeatherRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<WeatherUiState>(WeatherUiState.Loading)
    val uiState: StateFlow<WeatherUiState> = _uiState.asStateFlow()

    fun loadWeather(city: String) {
        viewModelScope.launch {
            repository.getWeather(city).collect { result ->
                _uiState.value = when (result) {
                    is Resource.Loading -> WeatherUiState.Loading
                    is Resource.Success -> WeatherUiState.Success(result.data)
                    is Resource.Error -> WeatherUiState.Error(result.message)
                }
            }
        }
    }
}
```

I show all three states in the UI — a loading indicator, the actual content, and an error screen with a retry button. Missing any of these shows I haven't thought about real-world scenarios.

#### What level of testing is expected?

At minimum, I write unit tests for the repository and ViewModel. These are the layers with actual logic. I mock the API service and DAO, and verify the repository emits the correct states for success, error, and cache scenarios.

```kotlin
class WeatherRepositoryTest {
    private val api = mockk<WeatherApi>()
    private val dao = mockk<WeatherDao>(relaxed = true)
    private val repository = WeatherRepository(api, dao)

    @Test
    fun `returns cached data and then fresh data on success`() = runTest {
        coEvery { dao.getWeather("London") } returns cachedWeatherEntity
        coEvery { api.getWeather("London") } returns remoteWeatherDto

        val states = repository.getWeather("London").toList()

        assertThat(states[0]).isEqualTo(Resource.Loading)
        assertThat(states[1]).isInstanceOf(Resource.Success::class.java)
        assertThat(states[2]).isInstanceOf(Resource.Success::class.java)
    }

    @Test
    fun `returns error when network fails and no cache exists`() = runTest {
        coEvery { dao.getWeather("London") } returns null
        coEvery { api.getWeather("London") } throws IOException()

        val states = repository.getWeather("London").toList()

        assertThat(states.last()).isInstanceOf(Resource.Error::class.java)
    }
}
```

Two solid repository tests beat five superficial tests that don't verify meaningful behavior. If I have time, I add a ViewModel test and one UI test.

#### How do I handle API keys securely?

I never commit API keys to the repository. I store them in `local.properties` (which is gitignored by default) and expose them through `BuildConfig`.

```kotlin
// build.gradle.kts
android {
    defaultConfig {
        val apiKey = project.findProperty("WEATHER_API_KEY") as? String ?: ""
        buildConfigField("String", "WEATHER_API_KEY", "\"$apiKey\"")
    }
}
```

I add a note in the README: "Add `WEATHER_API_KEY=your_key` to `local.properties`". Hardcoding keys directly in the Retrofit base URL is a red flag.

#### How should I approach a live coding interview vs a take-home test?

Live coding is about communication as much as coding. I think out loud — explain what I'm about to do before I do it. I start by restating the problem and asking clarifying questions. Then I sketch a high-level plan before writing code.

For live coding, I prioritize getting something working end to end quickly, then iterate. I don't spend 20 minutes setting up perfect architecture — the interviewer wants to see me ship working code and improve it. If I get stuck, I say so and explain my debugging thought process.

For take-home tests, the opposite is true — architecture and quality matter more than speed. I take the time to structure things properly, write tests, and clean up before submitting.

#### What should I do if I can't finish the coding test in time?

I submit what I have and document what's missing. I add a section in the README called "What I Would Add With More Time" and list the features or improvements with enough detail that the evaluator can see I knew what was needed.

```markdown
## What I Would Add With More Time
- Pagination for the weather forecast list using Paging 3
- UI tests with ComposeTestRule for the search flow
- Offline-first sync using WorkManager for background refresh
- Better error messages with specific handling for 429 (rate limit)
  and 503 (service unavailable) responses
```

A well-structured incomplete submission with clear documentation beats a rushed, messy complete one.

#### What differentiates a good submission from a great one?

A good submission has clean code, proper architecture, error handling, and tests. A great submission adds things that show senior-level thinking:

- Offline support with Room caching and a clear cache invalidation strategy
- Proper loading, error, and empty states — not just "it works when the API is up"
- Meaningful Git history that tells a story of how the app was built
- A README that explains trade-offs — "I chose Moshi over kotlinx.serialization because..."
- Edge case handling — no network, empty search results, slow API response
- Configuration change survival — state isn't lost on rotation

None of these are hard to implement, but most candidates skip them because they focus on features instead of quality.

#### How do I decide what to include and what to skip when time is limited?

I prioritize in this order: working core feature, proper architecture, error handling, at least one meaningful test, README. Everything else is bonus.

I skip animations, custom theming, advanced UI polish, and nice-to-have features like pull-to-refresh or dark mode. These don't affect the architecture score. If I have time left after the essentials, I add one bonus feature that demonstrates depth — like offline caching or pagination — rather than three superficial extras.

### Common Follow-ups

- How do you decide between single-module and multi-module for a coding test project?
- What dependency injection approach do you recommend for a small test project — Hilt, Koin, or manual DI?
- How would you add offline support to a coding test app if you had extra time?
- What's your approach to writing testable code from the start vs adding tests later?
- How do you handle configuration changes in a coding test app — ViewModel, rememberSaveable, or SavedStateHandle?
- What would you do if the API documentation provided for the test is incomplete or unclear?
- How do you balance code quality with feature completeness under time pressure?
