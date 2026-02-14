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

The weather or news reader app is the most common coding test assignment. It tests API integration, caching, error handling, and clean architecture in one project.

#### How do you set up Retrofit for API integration?

I define an API interface with suspend functions and create a Retrofit instance with Moshi or kotlinx.serialization. I avoid Gson because it bypasses Kotlin null safety.

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

I add an `HttpLoggingInterceptor` for debugging and set it to `NONE` before submission.

#### How do you parse JSON responses into Kotlin data classes?

I create data classes that mirror the JSON structure and use `@Json` (Moshi) or `@SerialName` (kotlinx.serialization) for field name mapping. I only parse the fields I need.

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

These are DTOs that map directly to the API response. I map them to domain models in the repository so the rest of the app doesn't depend on the API structure.

#### How do you implement loading, error, and success states?

I use a sealed interface for UI state and expose it from the ViewModel as a `StateFlow`. The UI observes this and renders the right screen.

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

I always include a retry button on the error screen. It's a small detail but it gets noticed when it's missing.

#### How do you handle network errors properly?

I wrap network calls in try-catch and map exceptions to meaningful error types. Raw exceptions should never leak into the ViewModel or UI.

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

The important part is the fallback to cached data on `IOException`. It shows I think about offline scenarios without building a full offline-first architecture.

#### How do you structure MVVM for a weather/news feature?

The ViewModel holds UI state and calls the repository. The repository handles data fetching from remote and local sources. The UI just renders state — no business logic in composables.

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

Using `SavedStateHandle` persists the selected city across process death. Most candidates lose the search query on process death — this shows I understand the Android lifecycle.

#### How do you implement search functionality?

I debounce the search input so I'm not firing API calls on every keystroke. I use `StateFlow` with `debounce` and `distinctUntilChanged`.

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

`debounce(300)` waits 300ms after the user stops typing. `distinctUntilChanged` prevents duplicate searches. The `filter` skips single characters which return too many results.

#### How do you implement pull-to-refresh?

I use Compose Material's `PullToRefreshBox` composable and expose an `isRefreshing` state from the ViewModel.

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

Pull-to-refresh is a nice-to-have in a coding test. If time is limited, I skip it and focus on error handling and tests.

#### How do you implement offline caching with Room?

I create an entity that maps my domain model to a database table. The repository is the single source of truth — fetch from network, store in Room, observe from Room.

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

`observeWeather` returns a `Flow` so the UI updates automatically when the database changes. The `lastUpdated` field lets me do simple cache invalidation — if the data is older than 30 minutes, I fetch fresh data from the API.

#### How do you handle the separation between DTOs, entities, and domain models?

I use three distinct model types. DTOs represent the API response. Entities represent the Room table. Domain models are what the rest of the app uses — clean, no Moshi or Room annotations.

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

This separation means changing the API response or database schema doesn't ripple through the entire app. Even just having DTO-to-domain mappers shows I understand this pattern.

#### How do you handle empty states in a list-based app?

I distinguish between three scenarios: initial loading, loaded but empty, and error. Each needs a different UI.

```kotlin
sealed interface NewsUiState {
    data object Loading : NewsUiState
    data class Success(val articles: List<Article>) : NewsUiState
    data object Empty : NewsUiState
    data class Error(val message: String) : NewsUiState
}

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

An explicit `Empty` state with a message like "No articles found" is much better than a blank screen.

#### How do you unit test the repository layer?

I mock the API and DAO, then verify the repository returns the right state for each scenario.

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

These two tests cover the most important paths. If time allows, I add tests for HTTP error codes and the case where both network and cache fail.

#### How do you structure the data layer to make it testable?

I define a repository interface and inject it into the ViewModel. In tests, I provide a fake implementation instead of using mocking frameworks.

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

class FakeWeatherRepository : WeatherRepository {
    var weatherToReturn: Resource<Weather> = Resource.Loading

    override fun observeWeather(city: String) = flowOf(weatherToReturn)
    override suspend fun refreshWeather(city: String) {}
}
```

A fake repository makes tests simpler and more readable. The ViewModel test doesn't need MockK or Mockito — just set `weatherToReturn` and verify the UI state.

#### How do you decide between StateFlow and LiveData for UI state?

I use `StateFlow`. It's the current standard for Android apps. It works with both Compose (`collectAsStateWithLifecycle`) and Views (`repeatOnLifecycle`), and integrates naturally with the coroutines ecosystem. LiveData still works but signals to evaluators that I'm not keeping up with current practices.

The one edge case is `SavedStateHandle.getLiveData()` — but even that has a `getStateFlow()` alternative now. In a 2024+ coding test, there's no reason to reach for LiveData.

#### What's the difference between Retrofit and Ktor for API integration?

Retrofit uses annotation-based interface definitions and generates the implementation at compile time. It sits on top of OkHttp and integrates with Moshi or Gson for serialization. Ktor is JetBrains' HTTP client built with coroutines and uses a DSL for request building instead of annotations.

For a coding test, I go with Retrofit — most evaluators expect it and it has more community resources. I'd choose Ktor if the job listing mentions Kotlin Multiplatform since Ktor runs on both Android and iOS while Retrofit is JVM-only.

#### How do you handle configuration changes without losing UI state?

ViewModel survives configuration changes by default, so any state in `StateFlow` or `MutableState` inside the ViewModel is safe. For state that needs to survive process death like the current search query, I use `SavedStateHandle`. For Compose-specific state not in the ViewModel like scroll position, I use `rememberSaveable`.

`ViewModel` + `SavedStateHandle` + `rememberSaveable` covers every scenario. I test this during development — rotate the device after typing a search query and navigating to a detail screen. If anything resets, there's a state preservation gap.

### Common Follow-ups

- How would you implement pagination in a news reader using Paging 3?
- What's the difference between `SharingStarted.WhileSubscribed(5000)` and `SharingStarted.Lazily`?
- How would you add a bookmark or favorites feature with Room?
- How do you test a ViewModel that uses `StateFlow` with Turbine?
- What caching strategy would you use — cache-first with network refresh, or network-first with cache fallback?
- How would you handle rate limiting from the API in a search feature?
- How do you decide what goes in the domain layer vs the data layer?
