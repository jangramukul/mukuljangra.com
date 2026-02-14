---
title: "Build a StackOverflow Users / GitHub Repos App"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 6
sequence: 74
description: "The StackOverflow users or GitHub repos app tests API integration, pagination, search, and clean architecture in a realistic coding challenge."
---

## Build a StackOverflow Users / GitHub Repos App

This coding test asks you to build an app that hits a public REST API (StackOverflow or GitHub), shows results in a list, and lets users search and view details. It covers networking, pagination, caching, and project structure under time pressure.

#### How do you set up Retrofit to call the StackOverflow or GitHub API?

I define an interface with suspend functions for each endpoint. The StackOverflow API needs query parameters like `site=stackoverflow`. The GitHub API needs an `Accept: application/vnd.github.v3+json` header.

```kotlin
interface GitHubApi {
    @GET("search/repositories")
    suspend fun searchRepos(
        @Query("q") query: String,
        @Query("page") page: Int = 1,
        @Query("per_page") perPage: Int = 20
    ): RepoSearchResponse

    @GET("users/{username}/repos")
    suspend fun getUserRepos(
        @Path("username") username: String
    ): List<RepoDto>
}

interface StackOverflowApi {
    @GET("users")
    suspend fun getUsers(
        @Query("page") page: Int = 1,
        @Query("pagesize") pageSize: Int = 30,
        @Query("site") site: String = "stackoverflow",
        @Query("order") order: String = "desc",
        @Query("sort") sort: String = "reputation"
    ): UsersResponse
}
```

Both APIs are free and don't need authentication for basic reads. GitHub caps unauthenticated calls at 60 per hour, so I add a token if I need more.

#### How do you display the fetched users or repos in a LazyColumn?

I pass the list to a `LazyColumn` and set a `key` on each item using the user ID or repo ID. This lets Compose track items correctly across recomposition.

```kotlin
@Composable
fun RepoListScreen(
    repos: List<Repo>,
    onRepoClick: (Repo) -> Unit
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(items = repos, key = { it.id }) { repo ->
            RepoCard(repo = repo, onClick = { onRepoClick(repo) })
        }
    }
}

@Composable
fun RepoCard(repo: Repo, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = repo.name, style = MaterialTheme.typography.titleMedium)
            Text(text = repo.description.orEmpty(), maxLines = 2)
            Text(text = "${repo.stars} stars", style = MaterialTheme.typography.bodySmall)
        }
    }
}
```

#### How do you handle loading, error, and empty states?

I use a sealed interface for UI state. I include an explicit empty state because a search might return zero results, and that shouldn't look like a loading screen.

```kotlin
sealed interface RepoUiState {
    data object Loading : RepoUiState
    data class Success(val repos: List<Repo>) : RepoUiState
    data object Empty : RepoUiState
    data class Error(val message: String) : RepoUiState
}
```

I map the API response to these states in the ViewModel. I show a retry button on error and a "No repositories found" message on empty.

#### How do you display user avatars with Coil?

I use `AsyncImage` from the Coil Compose library. Both APIs return image URLs — `avatar_url` for GitHub and `profile_image` for StackOverflow.

```kotlin
@Composable
fun UserAvatar(imageUrl: String, username: String) {
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(imageUrl)
            .crossfade(true)
            .placeholder(R.drawable.avatar_placeholder)
            .error(R.drawable.avatar_placeholder)
            .build(),
        contentDescription = "$username avatar",
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
    )
}
```

I always set `placeholder` and `error` drawables. Without them, the image area is blank while loading and it looks broken.

#### How do you navigate to a detail screen?

I pass the user ID or repo ID through navigation arguments. The detail screen's ViewModel fetches full data by that ID. I don't serialize the entire object through navigation.

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    NavHost(navController, startDestination = "repos") {
        composable("repos") {
            RepoListScreen(
                onRepoClick = { repo ->
                    navController.navigate("repos/${repo.owner}/${repo.name}")
                }
            )
        }
        composable(
            route = "repos/{owner}/{name}",
            arguments = listOf(
                navArgument("owner") { type = NavType.StringType },
                navArgument("name") { type = NavType.StringType }
            )
        ) {
            RepoDetailScreen()
        }
    }
}
```

For GitHub repos, I need both the owner and repo name to fetch details. For StackOverflow users, a single user ID is enough.

#### How do you implement search with debounce?

I use a `MutableStateFlow` for the query and chain `debounce`, `distinctUntilChanged`, and `filter` before triggering the API call. This avoids firing a request on every keystroke.

```kotlin
class SearchViewModel(
    private val repository: RepoRepository
) : ViewModel() {
    private val _query = MutableStateFlow("")

    val searchResults: StateFlow<SearchUiState> = _query
        .debounce(400)
        .distinctUntilChanged()
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            flow {
                emit(SearchUiState.Loading)
                when (val result = repository.searchRepos(query)) {
                    is Resource.Success -> emit(SearchUiState.Success(result.data))
                    is Resource.Error -> emit(SearchUiState.Error(result.message))
                    else -> emit(SearchUiState.Loading)
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.Lazily, SearchUiState.Initial)

    fun onQueryChanged(query: String) {
        _query.value = query
    }
}
```

400ms is a good debounce value. Lower and I hit the API too often. Higher and the search feels sluggish.

#### How do you structure the project packages?

I organize by feature with shared layers. A clean structure for a coding test:

- `data/remote/` — API interfaces, DTOs, response models
- `data/local/` — Room database, DAOs, entities
- `data/repository/` — Repository implementations
- `domain/model/` — Domain models
- `domain/repository/` — Repository interfaces
- `ui/list/` — List screen composables and ViewModel
- `ui/detail/` — Detail screen composables and ViewModel
- `ui/search/` — Search screen composables and ViewModel
- `di/` — Hilt modules

I don't over-engineer a coding test. If I only have two screens, I don't need a `domain/usecase/` package with single-method use case classes.

#### How do you implement pagination with Paging 3?

Both APIs support page-based pagination. The StackOverflow API returns a `has_more` boolean. The GitHub API uses `Link` headers with `rel="next"`. I use Paging 3's `PagingSource` to handle this.

```kotlin
class RepoPagingSource(
    private val api: GitHubApi,
    private val query: String
) : PagingSource<Int, Repo>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, Repo> {
        val page = params.key ?: 1
        return try {
            val response = api.searchRepos(query = query, page = page)
            val repos = response.items.map { it.toDomain() }
            LoadResult.Page(
                data = repos,
                prevKey = if (page == 1) null else page - 1,
                nextKey = if (repos.isEmpty()) null else page + 1
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, Repo>): Int? {
        return state.anchorPosition?.let { position ->
            state.closestPageToPosition(position)?.prevKey?.plus(1)
                ?: state.closestPageToPosition(position)?.nextKey?.minus(1)
        }
    }
}
```

In the ViewModel, I create a `Pager` and use `cachedIn(viewModelScope)` so loaded pages survive configuration changes.

#### How do you implement manual pagination without Paging 3?

I track the current page and loading state myself. I trigger the next page load when the user scrolls near the end of the list.

```kotlin
class RepoViewModel(
    private val repository: RepoRepository
) : ViewModel() {
    private val _repos = MutableStateFlow<List<Repo>>(emptyList())
    private var currentPage = 1
    private var isLoading = false
    private var hasMore = true

    val repos: StateFlow<List<Repo>> = _repos.asStateFlow()

    fun loadNextPage() {
        if (isLoading || !hasMore) return
        isLoading = true
        viewModelScope.launch {
            when (val result = repository.getRepos(page = currentPage)) {
                is Resource.Success -> {
                    _repos.value = _repos.value + result.data
                    hasMore = result.data.isNotEmpty()
                    currentPage++
                }
                is Resource.Error -> { /* update error state */ }
                else -> {}
            }
            isLoading = false
        }
    }
}
```

This approach works but misses Paging 3's built-in error handling, retry, and refresh logic.

#### How do you separate DTOs from domain models?

DTOs mirror the API response exactly. Domain models contain only the fields the app needs. Mapper functions convert between them. This keeps the API structure from leaking into UI code.

```kotlin
@JsonClass(generateAdapter = true)
data class RepoDto(
    val id: Long,
    val name: String,
    val owner: OwnerDto,
    val description: String?,
    @Json(name = "stargazers_count") val stars: Int,
    val language: String?,
    val fork: Boolean
)

data class Repo(
    val id: Long,
    val name: String,
    val ownerName: String,
    val ownerAvatarUrl: String,
    val description: String?,
    val stars: Int,
    val language: String?
)

fun RepoDto.toDomain() = Repo(
    id = id,
    name = name,
    ownerName = owner.login,
    ownerAvatarUrl = owner.avatarUrl,
    description = description,
    stars = stars,
    language = language
)
```

If the GitHub API changes its field names, I update the DTO and the mapper. The rest of the app stays the same.

#### How do you cache API responses in Room for offline access?

I create a Room entity that mirrors my domain model and a DAO for CRUD operations. The repository fetches from the API and stores results locally, then serves data from Room as the source of truth.

```kotlin
@Entity(tableName = "repos")
data class RepoEntity(
    @PrimaryKey val id: Long,
    val name: String,
    val ownerName: String,
    val ownerAvatarUrl: String,
    val description: String?,
    val stars: Int,
    val language: String?,
    val lastUpdated: Long = System.currentTimeMillis()
)

@Dao
interface RepoDao {
    @Query("SELECT * FROM repos ORDER BY stars DESC")
    fun observeAll(): Flow<List<RepoEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(repos: List<RepoEntity>)

    @Query("DELETE FROM repos WHERE lastUpdated < :threshold")
    suspend fun clearStale(threshold: Long)
}
```

The `lastUpdated` field lets me invalidate stale data. If cached repos are older than an hour, I fetch fresh data. If the network call fails, I fall back to whatever's in the cache.

#### How do you set up Hilt dependency injection for this project?

I create a module that provides the Retrofit instance, API interface, Room database, and repository. Hilt wires everything together at compile time.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideGitHubApi(): GitHubApi {
        return Retrofit.Builder()
            .baseUrl("https://api.github.com/")
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(GitHubApi::class.java)
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
            .build()
    }

    @Provides
    fun provideRepoDao(database: AppDatabase): RepoDao = database.repoDao()

    @Provides
    @Singleton
    fun provideRepoRepository(api: GitHubApi, dao: RepoDao): RepoRepository {
        return RepoRepositoryImpl(api, dao)
    }
}
```

I use `@Singleton` for the Retrofit instance, database, and repository. DAOs don't need `@Singleton` because Room returns the same instance from the database anyway.

#### How do you handle GitHub API rate limiting?

The GitHub API returns `429 Too Many Requests` or `403 Forbidden` when I hit the rate limit. I check the `X-RateLimit-Remaining` header on each response using an OkHttp interceptor.

```kotlin
class RateLimitInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val remaining = response.header("X-RateLimit-Remaining")?.toIntOrNull()
        if (remaining != null && remaining <= 0) {
            val resetTime = response.header("X-RateLimit-Reset")?.toLongOrNull()
            // Log or notify that rate limit is hit
        }
        return response
    }
}
```

The simplest fix for a coding test is adding a personal access token as a header. That raises the limit from 60 to 5,000 requests per hour. I store the token in `local.properties` or `BuildConfig` — never hardcoded in source.

#### What's the difference between the StackOverflow and GitHub API response structures?

The StackOverflow API wraps all responses in an envelope with `items`, `has_more`, and `quota_remaining`. The GitHub search API wraps results in `total_count` and `items`. GitHub non-search endpoints return arrays directly with no wrapper.

```kotlin
data class StackOverflowResponse<T>(
    val items: List<T>,
    @Json(name = "has_more") val hasMore: Boolean,
    @Json(name = "quota_remaining") val quotaRemaining: Int
)

data class GitHubSearchResponse<T>(
    @Json(name = "total_count") val totalCount: Int,
    val items: List<T>
)
```

This means my `PagingSource` uses `hasMore` for StackOverflow and checks if `items` is empty for GitHub. I pick one API and build it correctly rather than trying to support both in a timed test.

#### How do you unit test the ViewModel?

I use a fake repository instead of mocking. I set up the fake with known data, create the ViewModel, and assert the UI state transitions.

```kotlin
class RepoViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepository = FakeRepoRepository()
    private lateinit var viewModel: RepoViewModel

    @Test
    fun `shows repos when load succeeds`() = runTest {
        fakeRepository.setRepos(listOf(testRepo("Kotlin", 5000)))
        viewModel = RepoViewModel(fakeRepository)

        val turbine = viewModel.uiState.testIn(this)
        assertThat(turbine.awaitItem()).isEqualTo(RepoUiState.Loading)
        val success = turbine.awaitItem() as RepoUiState.Success
        assertThat(success.repos).hasSize(1)
        assertThat(success.repos[0].name).isEqualTo("Kotlin")
        turbine.cancel()
    }

    @Test
    fun `shows error when load fails`() = runTest {
        fakeRepository.setShouldFail(true)
        viewModel = RepoViewModel(fakeRepository)

        val turbine = viewModel.uiState.testIn(this)
        assertThat(turbine.awaitItem()).isEqualTo(RepoUiState.Loading)
        assertThat(turbine.awaitItem()).isInstanceOf(RepoUiState.Error::class.java)
        turbine.cancel()
    }
}
```

`MainDispatcherRule` replaces `Dispatchers.Main` with `UnconfinedTestDispatcher` so coroutines run synchronously in tests.

### Common Follow-ups

- How would you add sorting options (by stars, by name, by recently updated)?
- How would you handle the StackOverflow API's quota system in a production app?
- What's your approach to testing the PagingSource directly?
- How would you add a bookmarks/favorites feature that stores repos locally?
- How do you handle the case where the search API returns thousands of results?
- What would you change if the app needed to support both GitHub and StackOverflow?
- How would you implement pull-to-refresh with Paging 3?
