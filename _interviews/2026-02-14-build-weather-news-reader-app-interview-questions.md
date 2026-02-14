---
title: "Build a Weather / News Reader App"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 2
sequence: 70
description: "The weather or news reader app is the most common coding test assignment."
---

## Build a Weather / News Reader App

The weather or news reader app is the most common coding test assignment. It covers API integration, data caching, error handling, and clean architecture — all things evaluators want to see in a real-world Android project.

### Core Questions (Beginner → Intermediate)

#### Q1: How do you set up Retrofit for API integration in a coding test?

Define your API interface with suspend functions and create the Retrofit instance with a converter factory. Moshi or kotlinx.serialization are the preferred choices — avoid Gson for new projects because it bypasses Kotlin null safety.

```kotlin
interface WeatherApi {
    @GET("weather")
    suspend fun getCurrentWeather(
        @Query("q") city: String,
        @Query("appid") apiKey: String = BuildConfig.API_KEY
    ): WeatherResponse

    @GET("forecast")
    suspend fun getForecast(
        @Query("q") city: String,
        @Query("appid") apiKey: String = BuildConfig.API_KEY
    ): ForecastResponse
}

val retrofit = Retrofit.Builder()
    .baseUrl("https://api.openweathermap.org/data/2.5/")
    .client(okHttpClient)
    .addConverterFactory(MoshiConverterFactory.create(moshi))
    .build()
```

Add an `HttpLoggingInterceptor` to OkHttp for debugging during development. Remove it or set it to `NONE` before submission.

#### Q2: How do you parse JSON responses into Kotlin data classes?

Create data classes that mirror the JSON structure. Use `@Json` (Moshi) or `@SerialName` (kotlinx.serialization) for field name mapping. Only parse the fields you need — you don't have to map every field in the response.

```kotlin
@JsonClass(generateAdapter = true)
data class WeatherResponse(
    @Json(name = "main") val main: MainData,
    @Json(name = "weather") val weather: List<WeatherInfo>,
    @Json(name = "name") val cityName: String
)

@JsonClass(generateAdapter = true)
data class MainData(
    @Json(name = "temp") val temperature: Double,
    @Json(name = "humidity") val humidity: Int
)

@JsonClass(generateAdapter = true)
data class WeatherInfo(
    @Json(name = "description") val description: String,
    @Json(name = "icon") val icon: String
)
```

These are DTOs — data transfer objects that map directly to the API response. Map them to domain models in the repository so the rest of the app doesn't depend on the API structure.

#### Q3: How do you handle network errors properly?

Wrap your network calls in try-catch and map exceptions to meaningful error types. Don't let raw exceptions leak into the ViewModel or UI.

```kotlin
class WeatherRepository(
    private val api: WeatherApi,
    private val dao: WeatherDao
) {
    suspend fun getWeather(city: String): Resource<Weather> {
        return try {
            val response = api.getCurrentWeather(city)
            val weather = response.toDomain()
            dao.insertWeather(weather.toEntity())
            Resource.Success(weather)
        } catch (e: HttpException) {
            when (e.code()) {
                404 -> Resource.Error("City not found")
                429 -> Resource.Error("Too many requests. Try again later")
                else -> Resource.Error("Server error: ${e.code()}")
            }
        } catch (e: IOException) {
            val cached = dao.getWeather(city)
            if (cached != null) Resource.Success(cached.toDomain())
            else Resource.Error("No internet connection")
        }
    }
}
```

The key detail here is the fallback to cached data on `IOException`. This shows the evaluator you think about offline scenarios without building a full offline-first architecture.

#### Q4: How do you implement loading, error, and success states?

Use a sealed interface for UI state and expose it from the ViewModel as a `StateFlow`. The UI observes this state and renders the appropriate screen.

```kotlin
sealed interface WeatherUiState {
    data object Loading : WeatherUiState
    data class Success(val weather: Weather) : WeatherUiState
    data class Error(val message: String) : WeatherUiState
}

@Composable
fun WeatherScreen(viewModel: WeatherViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (val state = uiState) {
        is WeatherUiState.Loading -> CircularProgressIndicator()
        is WeatherUiState.Success -> WeatherContent(state.weather)
        is WeatherUiState.Error -> ErrorScreen(
            message = state.message,
            onRetry = { viewModel.retry() }
        )
    }
}
```

Always include a retry button on the error screen. It's a small detail but evaluators notice when it's missing.

#### Q5: How do you implement search functionality in a weather or news app?

Debounce the search input so you're not firing API calls on every keystroke. Use `StateFlow` with `debounce` and `distinctUntilChanged` operators.

```kotlin
class SearchViewModel(private val repository: NewsRepository) : ViewModel() {
    private val _query = MutableStateFlow("")

    val searchResults: StateFlow<SearchUiState> = _query
        .debounce(300)
        .distinctUntilChanged()
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            flow {
                emit(SearchUiState.Loading)
                val result = repository.search(query)
                emit(
                    when (result) {
                        is Resource.Success -> SearchUiState.Success(result.data)
                        is Resource.Error -> SearchUiState.Error(result.message)
                        is Resource.Loading -> SearchUiState.Loading
                    }
                )
            }
        }
        .stateIn(viewModelScope, SharingStarted.Lazily, SearchUiState.Initial)

    fun onQueryChanged(query: String) {
        _query.value = query
    }
}
```

The `debounce(300)` waits 300ms after the user stops typing before searching. `distinctUntilChanged` prevents duplicate searches for the same query. The `filter` avoids searching for single characters which usually return too many results.

#### Q6: How do you implement pull-to-refresh?

Use Compose Material's `pullToRefresh` modifier or the `PullToRefreshBox` composable. In the ViewModel, expose an `isRefreshing` state alongside the main UI state.

```kotlin
class WeatherViewModel(private val repository: WeatherRepository) : ViewModel() {
    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            repository.refreshWeather(currentCity)
            _isRefreshing.value = false
        }
    }
}

@Composable
fun WeatherScreen(viewModel: WeatherViewModel = hiltViewModel()) {
    val isRefreshing by viewModel.isRefreshing.collectAsStateWithLifecycle()

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { viewModel.refresh() }
    ) {
        // Content here
    }
}
```

Pull-to-refresh is a nice-to-have feature in a coding test. If time is limited, skip it and focus on error handling and tests instead.

#### Q7: How do you structure MVVM for a weather/news feature?

The ViewModel holds the UI state and calls the repository. The repository handles data fetching from remote and local sources. The UI just renders state — no business logic in composables.

```kotlin
class WeatherViewModel(
    private val repository: WeatherRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    private val city = savedStateHandle.getStateFlow("city", "London")

    val uiState: StateFlow<WeatherUiState> = city
        .flatMapLatest { repository.observeWeather(it) }
        .map { resource ->
            when (resource) {
                is Resource.Loading -> WeatherUiState.Loading
                is Resource.Success -> WeatherUiState.Success(resource.data)
                is Resource.Error -> WeatherUiState.Error(resource.message)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), WeatherUiState.Loading)

    fun updateCity(city: String) {
        savedStateHandle["city"] = city
    }
}
```

Using `SavedStateHandle` to persist the selected city across process death is a detail that shows you understand Android lifecycle deeply. Most candidates lose the search query on process death.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How do you implement offline caching with Room?

Create an entity that maps your domain model to a database table. The repository acts as the single source of truth — fetch from network, store in Room, and observe from Room.

```kotlin
@Entity(tableName = "weather")
data class WeatherEntity(
    @PrimaryKey val city: String,
    val temperature: Double,
    val description: String,
    val humidity: Int,
    val lastUpdated: Long = System.currentTimeMillis()
)

@Dao
interface WeatherDao {
    @Query("SELECT * FROM weather WHERE city = :city")
    fun observeWeather(city: String): Flow<WeatherEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWeather(weather: WeatherEntity)

    @Query("DELETE FROM weather WHERE lastUpdated < :threshold")
    suspend fun clearStaleData(threshold: Long)
}
```

The `observeWeather` returns a `Flow` so the UI automatically updates when the database changes. The `lastUpdated` field lets you implement simple cache invalidation — if the data is older than a threshold (say 30 minutes), fetch fresh data from the API.

#### Q9: How do you unit test the repository layer?

Mock the API and DAO, then verify the repository returns the right state for each scenario — network success, network failure with cache, and network failure without cache.

```kotlin
@Test
fun `returns fresh data when network succeeds`() = runTest {
    val api = mockk<WeatherApi>()
    val dao = mockk<WeatherDao>(relaxed = true)
    val repository = WeatherRepository(api, dao)

    coEvery { api.getCurrentWeather("London") } returns weatherResponse

    val result = repository.getWeather("London")

    assertThat(result).isInstanceOf(Resource.Success::class.java)
    assertThat((result as Resource.Success).data.city).isEqualTo("London")
    coVerify { dao.insertWeather(any()) }
}

@Test
fun `falls back to cache when network fails`() = runTest {
    val api = mockk<WeatherApi>()
    val dao = mockk<WeatherDao>()
    val repository = WeatherRepository(api, dao)

    coEvery { api.getCurrentWeather("London") } throws IOException()
    coEvery { dao.getWeather("London") } returns cachedEntity

    val result = repository.getWeather("London")

    assertThat(result).isInstanceOf(Resource.Success::class.java)
}
```

These two tests cover the most important paths. If time allows, add tests for HTTP error codes (404, 429) and the case where both network and cache fail.

#### Q10: How do you handle the separation of concerns between DTOs, entities, and domain models?

Use three distinct model types. DTOs (Data Transfer Objects) represent the API response and live in the data layer. Entities represent the Room database structure. Domain models are what the rest of the app uses — they're clean, contain only what the feature needs, and don't have annotations from Moshi or Room.

```kotlin
// DTO — mirrors API JSON
@JsonClass(generateAdapter = true)
data class WeatherDto(
    @Json(name = "main") val main: MainDto,
    @Json(name = "name") val cityName: String
)

// Entity — mirrors Room table
@Entity(tableName = "weather")
data class WeatherEntity(
    @PrimaryKey val city: String,
    val temperature: Double,
    val lastUpdated: Long
)

// Domain model — what the app actually uses
data class Weather(
    val city: String,
    val temperature: Double,
    val description: String
)

// Mapper functions
fun WeatherDto.toDomain() = Weather(
    city = cityName,
    temperature = main.temp,
    description = weather.firstOrNull()?.description ?: ""
)

fun WeatherEntity.toDomain() = Weather(
    city = city,
    temperature = temperature,
    description = description
)
```

This separation means changing the API response structure or database schema doesn't ripple through the entire app. In a coding test, even just having DTO-to-domain mappers shows you understand this pattern.

#### Q11: What's the difference between using Retrofit and Ktor for API integration?

Retrofit uses annotation-based interface definitions and generates the implementation at compile time. It sits on top of OkHttp and integrates with Moshi or Gson for serialization. Ktor is JetBrains' HTTP client built entirely with coroutines and uses a DSL for request building instead of annotations.

For a coding test, Retrofit is the safer choice — most evaluators expect it and it has more community resources. Choose Ktor if the job listing mentions Kotlin Multiplatform, since Ktor runs on both Android and iOS while Retrofit is JVM-only.

#### Q12: How do you handle empty states in a list-based app like a news reader?

Distinguish between three scenarios: initial loading (no data yet), loaded but empty (search returned no results), and error (something went wrong). Each needs a different UI.

```kotlin
sealed interface NewsUiState {
    data object Loading : NewsUiState
    data class Success(val articles: List<Article>) : NewsUiState
    data object Empty : NewsUiState
    data class Error(val message: String) : NewsUiState
}

// In ViewModel
val uiState: StateFlow<NewsUiState> = repository.getArticles()
    .map { resource ->
        when (resource) {
            is Resource.Success -> {
                if (resource.data.isEmpty()) NewsUiState.Empty
                else NewsUiState.Success(resource.data)
            }
            is Resource.Error -> NewsUiState.Error(resource.message)
            is Resource.Loading -> NewsUiState.Loading
        }
    }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), NewsUiState.Loading)
```

An explicit `Empty` state with a message like "No articles found for this query" is much better than just showing a blank screen. This is a detail evaluators check.

#### Q13: How do you structure the data layer to make it testable?

Define a repository interface and inject it into the ViewModel. The real implementation uses the API and DAO. In tests, you can provide a fake implementation without mocking frameworks.

```kotlin
interface WeatherRepository {
    fun observeWeather(city: String): Flow<Resource<Weather>>
    suspend fun refreshWeather(city: String)
}

class WeatherRepositoryImpl(
    private val api: WeatherApi,
    private val dao: WeatherDao
) : WeatherRepository {
    override fun observeWeather(city: String): Flow<Resource<Weather>> =
        dao.observeWeather(city).map { entity ->
            if (entity != null) Resource.Success(entity.toDomain())
            else Resource.Loading
        }

    override suspend fun refreshWeather(city: String) {
        val response = api.getCurrentWeather(city)
        dao.insertWeather(response.toEntity())
    }
}

// Fake for testing
class FakeWeatherRepository : WeatherRepository {
    var weatherToReturn: Resource<Weather> = Resource.Loading

    override fun observeWeather(city: String) = flowOf(weatherToReturn)
    override suspend fun refreshWeather(city: String) {}
}
```

Using a fake repository instead of mocks makes tests simpler and more readable. The ViewModel test doesn't need MockK or Mockito — just set `weatherToReturn` and verify the UI state.

#### Q14: How do you decide between StateFlow and LiveData for exposing UI state?

Use `StateFlow`. It's the current standard for Android apps, works well with both Compose (`collectAsStateWithLifecycle`) and Views (`lifecycleScope.launch` with `repeatOnLifecycle`), and integrates naturally with the rest of the coroutines ecosystem. LiveData still works, but it signals to evaluators that you're not keeping up with current practices.

The one edge case is `SavedStateHandle.getLiveData()` — but even that has a `getStateFlow()` alternative now. In a 2024+ coding test, there's no reason to reach for LiveData.

#### Q15: How do you handle configuration changes without losing UI state?

ViewModel survives configuration changes by default, so any state in `StateFlow` or `MutableState` inside the ViewModel is safe. For state that needs to survive process death (like the current search query), use `SavedStateHandle`. For Compose-specific state that's not in the ViewModel (like scroll position), use `rememberSaveable`.

The combination of `ViewModel` + `SavedStateHandle` + `rememberSaveable` covers every scenario. Make sure to test this during development — rotate the device after typing a search query and navigating to a detail screen. If anything resets, you have a state preservation gap.

### Common Follow-ups

- How would you implement pagination in a news reader using Paging 3?
- What's the difference between `SharingStarted.WhileSubscribed(5000)` and `SharingStarted.Lazily`?
- How would you add a bookmark or favorites feature with Room?
- How do you test a ViewModel that uses `StateFlow` with Turbine?
- What caching strategy would you use — cache-first with network refresh, or network-first with cache fallback?
- How would you handle rate limiting from the API in a search feature?
- How do you decide what goes in the domain layer vs the data layer?
