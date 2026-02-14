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

If there's one coding test that every Android candidate will face at some point, it's this one. Build a weather app, build a news reader -- same idea, different API. It sounds simple, but it's a trojan horse. The evaluator is watching how you wire up networking, how you handle failure, how you cache data, and whether your architecture would survive a real codebase. One small project, a dozen things to get right.

#### How do you set up Retrofit for API integration?

Think of Retrofit like a translator standing between your Kotlin code and a REST API. You describe what you want in a Kotlin interface, and Retrofit handles all the boring HTTP stuff behind the scenes. I define suspend functions so the calls play nicely with coroutines, and I pair it with Moshi or kotlinx.serialization -- never Gson, because Gson happily ignores Kotlin's null safety and you'll get surprise `null`s at runtime.

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

I add an `HttpLoggingInterceptor` for debugging and set it to `NONE` before submission. Leaving verbose network logs in your take-home is like leaving `println("HERE!!!")` in production code.

#### How do you parse JSON responses into Kotlin data classes?

I create data classes that mirror the JSON structure. The `@Json` annotation (Moshi) or `@SerialName` (kotlinx.serialization) handles the name mapping when the JSON field names don't match my Kotlin property names. I only parse the fields I actually need -- no point creating properties for data I'll never touch.

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

These are DTOs -- they exist only to catch what the API throws at you. I map them to domain models in the repository so the rest of the app doesn't care if the API suddenly renames `temp` to `temperature_kelvin`.

#### How do you implement loading, error, and success states?

Here's the thing -- your UI can only be in one of three states at any moment: loading, showing data, or showing an error. A sealed interface makes that contract explicit. The compiler will yell at you if you forget to handle a state, which is exactly what you want.

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

I always include a retry button on the error screen. It's a small detail but evaluators notice when it's missing -- it shows you think about what the user actually does when something goes wrong.

> **🧠 Think about it:** What happens if your network call fails and you show an error screen with no retry button? The user is stuck. They'd have to kill the app and reopen it. That's the kind of UX gap evaluators look for.

#### How do you handle network errors properly?

Raw exceptions leaking into your UI is like letting a plumbing problem flood your living room. You catch them at the source -- in the repository -- and translate them into something the UI can work with. Different exceptions mean different things to the user, so map them accordingly.

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

The sneaky-good part here is the `IOException` branch. Instead of immediately showing an error, I check if there's cached data. If there is, the user sees stale data instead of a dead screen. It's not a full offline-first architecture, but it shows you think about what happens when the subway goes underground.

#### How do you structure MVVM for a weather/news feature?

Think of it like a restaurant. The UI is the waiter -- it takes orders and delivers food, but never cooks anything. The ViewModel is the kitchen manager -- it coordinates what needs to happen. The repository is the actual kitchen -- it knows where the ingredients come from (API or local storage) and how to prepare them.

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

Using `SavedStateHandle` persists the selected city across process death. Most candidates lose the search query when Android kills the process in the background. This one detail shows you actually understand the Android lifecycle beyond just "ViewModel survives rotation."

#### How do you implement search functionality?

Imagine if every single keystroke fired a network request. The user types "London" and you just made 6 API calls -- L, Lo, Lon, Lond, Londo, London. That's wasteful and potentially rate-limit-triggering. The fix is debouncing: wait until the user stops typing for 300ms, then fire one request.

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

`debounce(300)` waits 300ms after the user stops typing. `distinctUntilChanged` prevents duplicate searches if the user types and deletes back to the same text. The `filter` skips single characters -- searching for "L" returns too many results to be useful.

#### How do you implement pull-to-refresh?

I use Compose Material's `PullToRefreshBox` composable and expose an `isRefreshing` state from the ViewModel. It's the classic "user drags down, spinner appears, data refreshes" pattern.

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

Pull-to-refresh is a nice-to-have in a coding test. If time is tight, skip it and focus on error handling and tests -- those carry more weight with evaluators.

> **🧠 Think about it:** If your repository already has a `refreshWeather` function that fetches from network and updates Room, and your UI observes Room via Flow, do you even need to manually update the UI state after refresh? The data flows automatically -- Room emits a new value, the Flow picks it up, the UI recomposes.

#### How do you implement offline caching with Room?

Room is your local database, and in a weather/news app, it plays a critical role. Think of the repository as a single source of truth -- it fetches from the network, stores in Room, and the UI always reads from Room. It's like a library that orders new books online but you always borrow from the shelf, never directly from Amazon.

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

`observeWeather` returns a `Flow`, so the UI updates automatically whenever the database changes -- no manual refresh needed. The `lastUpdated` field lets me do simple cache invalidation. If the data is older than 30 minutes, I fetch fresh data from the API. Simple, but effective.

#### How do you handle the separation between DTOs, entities, and domain models?

Three model types, three jobs. DTOs catch what the API sends. Entities map to Room tables. Domain models are what the actual app logic uses -- clean, no annotations, no dependencies on Moshi or Room.

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

It's like having a shipping box (DTO), a storage container (Entity), and the actual product (domain model). If the API changes its JSON structure, only the DTO and its mapper change. The rest of the app doesn't even notice. Even just having these mapper functions shows you understand why this separation matters.

#### How do you handle empty states in a list-based app?

A blank screen is the worst user experience. The user has no idea if the app is broken, if there's no data, or if something went wrong. I distinguish between three scenarios: still loading, loaded but nothing found, and actual error. Each gets its own UI.

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

An explicit `Empty` state with a message like "No articles found" is much better than a blank screen. It tells the user "we looked, there's just nothing here" instead of leaving them guessing.

#### How do you unit test the repository layer?

I mock the API and DAO, then verify the repository does the right thing for each scenario. The two most important tests: does it return data when the network works, and does it fall back to cache when the network doesn't?

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

These two tests cover the most critical paths. If time allows, I add tests for specific HTTP error codes and the case where both network and cache fail. But these two alone show you think about both happy and unhappy paths.

#### How do you structure the data layer to make it testable?

The trick is simple: program against an interface, not an implementation. I define a repository interface and inject it into the ViewModel. In tests, I swap in a fake implementation -- no mocking framework needed.

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

A fake repository makes tests dramatically simpler. The ViewModel test doesn't need MockK or Mockito -- just set `weatherToReturn` and verify the UI state. It reads like plain English.

> **🧠 Think about it:** Why are fakes often better than mocks for testing? With a mock, you verify that specific methods were called. With a fake, you verify the actual behavior -- what the ViewModel does with the data. If you refactor the repository internals, mock-based tests break even though the behavior didn't change. Fake-based tests don't care about internals.

#### How do you decide between StateFlow and LiveData for UI state?

`StateFlow`. That's it. It's the current standard for Android apps. It works with Compose via `collectAsStateWithLifecycle`, with Views via `repeatOnLifecycle`, and it plugs into the entire coroutines ecosystem naturally. LiveData still works, but using it in a coding test signals to evaluators that you haven't kept up with how the ecosystem has moved.

The one edge case is `SavedStateHandle.getLiveData()` -- but even that has a `getStateFlow()` alternative now. In a 2024+ coding test, there's no reason to reach for LiveData.

#### What's the difference between Retrofit and Ktor for API integration?

Retrofit is the annotation-based veteran. You define an interface, annotate it, and Retrofit generates the implementation. It sits on top of OkHttp and pairs with Moshi or Gson for serialization. Ktor is JetBrains' HTTP client, built on coroutines from the ground up, using a DSL for request building instead of annotations.

For a coding test, I go with Retrofit. Most evaluators expect it, it has more community resources, and you'll spend less time on setup. I'd switch to Ktor only if the job listing mentions Kotlin Multiplatform, because Ktor runs on both Android and iOS while Retrofit is JVM-only.

#### How do you handle configuration changes without losing UI state?

ViewModel survives configuration changes by default, so any `StateFlow` or `MutableState` inside it is safe across rotations. For state that needs to survive process death -- like the current search query -- I use `SavedStateHandle`. For Compose-specific state that doesn't live in the ViewModel, like scroll position, I use `rememberSaveable`.

`ViewModel` + `SavedStateHandle` + `rememberSaveable` covers every scenario. I test this during development by rotating the device after typing a search query and navigating to a detail screen. If anything resets, there's a state preservation gap.

### Common Follow-ups

- How would you implement pagination in a news reader using Paging 3?
- What's the difference between `SharingStarted.WhileSubscribed(5000)` and `SharingStarted.Lazily`?
- How would you add a bookmark or favorites feature with Room?
- How do you test a ViewModel that uses `StateFlow` with Turbine?
- What caching strategy would you use — cache-first with network refresh, or network-first with cache fallback?
- How would you handle rate limiting from the API in a search feature?
- How do you decide what goes in the domain layer vs the data layer?
