---
title: "Coding Test — What Companies Expect"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 1
sequence: 23
---

## Coding Test — What Companies Expect

Most Android interview pipelines include a practical coding test — either a take-home project or a live coding session. Knowing what evaluators actually look for is just as important as knowing how to code.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the common coding test formats companies use?

There are three main formats. Timed take-home is the most common — you get a problem statement and 3-6 hours (sometimes 24-48 hours with a time cap) to build a solution. Untimed take-home gives you a few days with no strict time limit, but evaluators still gauge effort by scope. Live coding puts you on a shared screen with an interviewer — you build or modify something in real time while explaining your thought process.

Some companies also do "fix and extend" — they hand you an existing codebase with bugs or missing features, and you need to fix issues, add a feature, and improve code quality.

#### Q2: What do evaluators actually look for in a coding test submission?

Evaluators check five things in roughly this priority:

- **Code quality** — clean naming, short functions, no dead code, no commented-out blocks
- **Architecture** — separation of concerns, proper layering (UI, domain, data), dependency direction
- **Error handling** — network failures, empty states, edge cases handled gracefully
- **Testing** — at least unit tests for the core logic (repository, ViewModel, use cases)
- **Documentation** — a clear README explaining how to build, run, and navigate the project

A working app with poor architecture scores lower than a well-architected app that's missing a minor feature. Evaluators care about how you think, not just that it works.

#### Q3: How should you structure a coding test project?

Use a standard Android project structure with clear package separation. At minimum, separate your code into `data`, `domain`, and `ui` (or `presentation`) packages. Inside each, group by feature when the project has more than one screen.

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

This structure tells the evaluator you understand layered architecture without overcomplicating a small project. Don't create empty layers or packages just for show — if the project is simple enough that use cases add nothing, skip the domain layer and go straight from ViewModel to repository.

#### Q4: What should a good README contain for a coding test?

A good README covers four things: how to build and run (including any API key setup), architecture decisions and why you made them, what you would improve with more time, and any assumptions you made about ambiguous requirements.

Keep it short — 200-400 words is enough. Evaluators read dozens of submissions, so a concise README that highlights your thinking is better than a long one that restates the obvious.

#### Q5: How important is Git history in a coding test?

More important than most candidates realize. Evaluators often check your commit history to understand how you work. A single "initial commit" with everything tells them nothing. Small, logical commits like "set up project structure", "add Retrofit API client", "implement weather repository with caching", "add unit tests for repository" show that you work incrementally and think in organized steps.

Don't rewrite history to look perfect — that feels dishonest. But do commit at natural breakpoints instead of dumping everything at the end.

#### Q6: How should you handle time management in a timed take-home test?

Split your time roughly into thirds: first third for setup, architecture, and API integration — get data flowing end to end. Second third for UI, error handling, and edge cases. Final third for testing, cleanup, and README.

The biggest mistake is spending too long on UI polish or animations. A clean, functional app with proper architecture and tests scores better than a pixel-perfect app with no error handling. If you're running out of time, skip nice-to-have features and focus on making what you have solid.

#### Q7: What are the most common mistakes candidates make in coding tests?

- No error handling — the app crashes on network failure or shows a blank screen
- No tests — not even a single unit test for the repository or ViewModel
- Over-engineering — creating abstractions for things that don't need them in a small project
- No README — evaluators shouldn't have to read your code to understand the project
- Hardcoded API keys in source — use `local.properties` or `BuildConfig`
- Ignoring edge cases — empty lists, no network, invalid input
- Submitting code that doesn't compile — always do a clean build from a fresh checkout before submitting

#### Q8: How should you handle ambiguous requirements in a coding test?

Document your assumptions and move on. If the requirements say "build a weather app" but don't specify whether to show a 5-day forecast or just current weather, pick one, build it well, and note your assumption in the README. Evaluators want to see how you handle ambiguity, not that you built exactly what they imagined.

If the company allows questions, ask two or three clarifying questions before you start — like what API to use, whether offline support is expected, and whether Compose or XML is preferred. This shows you think before coding.

#### Q9: Should you use Jetpack Compose or XML Views for a coding test?

Use whatever you're stronger in, unless the job description specifically mentions one. If the company's tech stack uses Compose, go with Compose — it signals that you're current. If you're comfortable with both, Compose is generally the better choice for new projects because it's less boilerplate and evaluators see it as a positive signal.

Don't mix both in the same project. That looks scattered, not versatile.

### Deep Dive Questions (Advanced → Expert)

#### Q10: What does a good project architecture look like for a small coding test app?

A clean single-module MVVM setup with repository pattern is the sweet spot. You don't need Clean Architecture with use cases for a 2-3 screen app. The key is clear dependency direction — ViewModel depends on Repository, Repository depends on API service and DAO, but nothing depends on the ViewModel.

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

Use Hilt for DI — it takes 10 minutes to set up and shows you understand dependency management. Manual DI is fine too, but Hilt is expected at most companies.

#### Q11: How should you implement error handling in a coding test app?

Use a sealed class for UI state that covers loading, success, and error. The ViewModel exposes this state and the UI renders accordingly. This is the pattern evaluators expect.

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

Show all three states in the UI — a loading indicator, the actual content, and an error screen with a retry button. Missing any of these tells the evaluator you don't think about real-world scenarios.

#### Q12: What level of testing is expected in a coding test?

At minimum, write unit tests for the repository and ViewModel. These are the layers with actual logic. Mock the API service and DAO, and verify the repository emits the correct states for success, error, and cache scenarios.

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

If you have time, add a ViewModel test and one UI test. But two solid repository tests beat five superficial tests that don't actually verify meaningful behavior.

#### Q13: How do you handle API keys securely in a coding test project?

Never commit API keys to the repository. Store them in `local.properties` (which is gitignored by default) and expose them through `BuildConfig`.

```kotlin
// build.gradle.kts
android {
    defaultConfig {
        val apiKey = project.findProperty("WEATHER_API_KEY") as? String ?: ""
        buildConfigField("String", "WEATHER_API_KEY", "\"$apiKey\"")
    }
}
```

Add a note in the README: "Add `WEATHER_API_KEY=your_key` to `local.properties`". This shows awareness of security basics. Some candidates skip this and hardcode keys directly in the Retrofit base URL — that's a red flag for evaluators.

#### Q14: What differentiates a good submission from a great submission?

A good submission has clean code, proper architecture, error handling, and tests. A great submission adds things that show senior-level thinking:

- Offline support with Room caching and a clear cache invalidation strategy
- Proper loading, error, and empty states — not just "it works when the API is up"
- Meaningful Git history that tells a story of how the app was built
- A README that explains trade-offs — "I chose Moshi over kotlinx.serialization because..."
- Edge case handling — what happens with no network, empty search results, or a slow API response
- Configuration change survival — state isn't lost on rotation

None of these are hard to implement, but most candidates skip them because they focus on features instead of quality.

#### Q15: How should you approach a live coding interview vs a take-home test?

Live coding is about communication as much as coding. Think out loud — explain what you're about to do before you do it. Start by restating the problem and asking clarifying questions. Sketch a high-level plan (even verbally) before writing code.

For live coding, prioritize getting something working end to end quickly, then iterate. Don't spend 20 minutes setting up perfect architecture — the interviewer wants to see you ship working code and then improve it. If you get stuck, say so and explain your thought process for debugging.

For take-home tests, the opposite is true — architecture and quality matter more than speed. Take the time to structure things properly, write tests, and clean up before submitting.

#### Q16: What should you do if you can't finish the coding test in time?

Submit what you have and document what's missing. Add a section in the README called "What I Would Add With More Time" and list the features or improvements you would have added — with enough detail that the evaluator can see you knew what was needed.

```markdown
## What I Would Add With More Time
- Pagination for the weather forecast list using Paging 3
- UI tests with ComposeTestRule for the search flow
- Offline-first sync using WorkManager for background refresh
- Better error messages with specific handling for 429 (rate limit) 
  and 503 (service unavailable) responses
```

A well-structured incomplete submission with clear documentation beats a rushed, messy complete submission. Evaluators understand time constraints — they care about your judgment and prioritization.

#### Q17: How do you decide what to include and what to skip when time is limited?

Prioritize in this order: working core feature, proper architecture, error handling, at least one meaningful test, README. Everything else is bonus.

Skip animations, custom theming, advanced UI polish, and nice-to-have features like pull-to-refresh or dark mode. These don't affect the architecture score, which is what evaluators weight most heavily. If you have time left after the essentials, add one bonus feature that demonstrates depth — like offline caching or pagination — rather than three superficial extras.

### Common Follow-ups

- How do you decide between single-module and multi-module for a coding test project?
- What dependency injection approach do you recommend for a small test project — Hilt, Koin, or manual DI?
- How would you add offline support to a coding test app if you had extra time?
- What's your approach to writing testable code from the start vs adding tests later?
- How do you handle configuration changes in a coding test app — ViewModel, rememberSaveable, or SavedStateHandle?
- What would you do if the API documentation provided for the test is incomplete or unclear?
- How do you balance code quality with feature completeness under time pressure?
