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

This is one of those coding tests that sounds simple on paper -- hit a public API, show a list, let users search. But it quietly tests everything: networking, pagination, caching, architecture, and how clean your code stays under time pressure. It's basically a mini production app squeezed into a few hours.

#### How do you set up Retrofit to call the StackOverflow or GitHub API?

Think of Retrofit like a translator sitting between your app and the API. You describe what you want in Kotlin (an interface with suspend functions), and Retrofit handles the actual HTTP conversation. The StackOverflow API needs `site=stackoverflow` as a query parameter on every call. The GitHub API wants an `Accept: application/vnd.github.v3+json` header.

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

Both APIs are free and don't need authentication for basic reads. But here's the catch -- GitHub caps unauthenticated calls at 60 per hour. You'll burn through that fast while developing. Add a token if you need more headroom.

#### How do you display the fetched users or repos in a LazyColumn?

Pass your list to a `LazyColumn` and always set a `key` on each item using the user ID or repo ID. Without the key, Compose has no way to tell items apart across recomposition -- it's like a teacher trying to track students who all forgot their name tags.

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

I use a sealed interface for UI state. The important thing most people miss -- you need an explicit `Empty` state. A search returning zero results is not the same as loading. If you don't model it separately, your users stare at a spinner forever wondering if something broke.

```kotlin
sealed interface RepoUiState {
    data object Loading : RepoUiState
    data class Success(val repos: List<Repo>) : RepoUiState
    data object Empty : RepoUiState
    data class Error(val message: String) : RepoUiState
}
```

Map the API response to these states in the ViewModel. Show a retry button on error and a "No repositories found" message on empty. Simple, but it makes the difference between an app that feels polished and one that feels half-baked.

> **🧠 Think about it:** If the network fails but you have cached data from a previous successful load, which state should you show -- Error or Success with stale data?

#### How do you display user avatars with Coil?

`AsyncImage` from the Coil Compose library does the heavy lifting. Both APIs give you image URLs -- `avatar_url` for GitHub and `profile_image` for StackOverflow.

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

Always set `placeholder` and `error` drawables. Without them, the image area is just a blank hole while loading. It looks broken, even when it's not.

#### How do you navigate to a detail screen?

Pass the user ID or repo ID through navigation arguments. The detail screen's ViewModel fetches the full data using that ID. Don't try to serialize the entire object through navigation -- it's like trying to fit a sofa through a mail slot. Just send the address and let the other side look it up.

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

For GitHub repos, you need both the owner and repo name to fetch details. For StackOverflow users, a single user ID is enough.

#### How do you implement search with debounce?

Here's the thing -- you don't want to fire an API request on every single keystroke. If someone types "kotlin" that's 6 requests when you only needed one. I use a `MutableStateFlow` for the query and chain `debounce`, `distinctUntilChanged`, and `filter` before triggering the call. It's like a patient receptionist who waits until you're done talking before picking up the phone.

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

400ms is the sweet spot for debounce. Lower and you're hammering the API. Higher and search feels sluggish. 400ms gives the user enough time to pause between words without feeling like the app is asleep.

#### How do you structure the project packages?

I organize by feature with shared layers:

- `data/remote/` -- API interfaces, DTOs, response models
- `data/local/` -- Room database, DAOs, entities
- `data/repository/` -- Repository implementations
- `domain/model/` -- Domain models
- `domain/repository/` -- Repository interfaces
- `ui/list/` -- List screen composables and ViewModel
- `ui/detail/` -- Detail screen composables and ViewModel
- `ui/search/` -- Search screen composables and ViewModel
- `di/` -- Hilt modules

Don't over-engineer a coding test. If you only have two screens, you don't need a `domain/usecase/` package with single-method use case classes. That's like building a parking garage for a bicycle.

> **🧠 Think about it:** If your coding test has only two screens and no complex business logic, would adding a use case layer impress the interviewer or signal that you can't judge when abstraction adds value?

#### How do you implement pagination with Paging 3?

Both APIs support page-based pagination, but they signal "there's more data" differently. StackOverflow hands you a `has_more` boolean. GitHub uses `Link` headers with `rel="next"`. Paging 3's `PagingSource` abstracts over both approaches.

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

In the ViewModel, create a `Pager` and call `cachedIn(viewModelScope)` so loaded pages survive configuration changes. Without `cachedIn`, rotating the phone means re-fetching everything from page one.

#### How do you implement manual pagination without Paging 3?

Sometimes Paging 3 is overkill or you're short on time. In that case, track the current page and loading state yourself. Trigger the next page load when the user scrolls near the bottom of the list.

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

This works, but you're on your own for error handling, retry, and refresh logic. Paging 3 gives you all of that for free. Manual pagination is like building your own bookshelf instead of buying one from IKEA -- you can do it, but know what you're giving up.

#### How do you separate DTOs from domain models?

DTOs mirror the API response exactly -- every field, every weird name the backend chose. Domain models contain only what your app actually needs. Mapper functions translate between them. Think of it like customs at the border: the raw cargo (DTO) comes in, gets inspected and repackaged into something your country (UI) understands.

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

If the GitHub API changes its field names tomorrow, you update the DTO and the mapper. The rest of the app doesn't even notice. That's the whole point.

#### How do you cache API responses in Room for offline access?

Create a Room entity that mirrors your domain model and a DAO for CRUD operations. The repository fetches from the API and writes to Room, then the UI reads from Room as the single source of truth. It's the classic "network-first, cache-fallback" pattern.

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

The `lastUpdated` field is your freshness check. If cached repos are older than an hour, fetch fresh data. If the network call fails, fall back to whatever's in the cache. Stale data is better than no data.

#### How do you set up Hilt dependency injection for this project?

One module, all your dependencies. Hilt wires the Retrofit instance, API interface, Room database, and repository together at compile time. No runtime reflection, no manual graph building.

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

Notice `provideRepoDao` doesn't have `@Singleton`. Room already returns the same DAO instance from the database object, so marking it singleton would be redundant. Use `@Singleton` where it actually matters -- Retrofit, the database, and the repository.

#### How do you handle GitHub API rate limiting?

GitHub sends back `429 Too Many Requests` or `403 Forbidden` when you've used up your quota. The trick is catching this before it becomes a user-facing error. I check the `X-RateLimit-Remaining` header on every response using an OkHttp interceptor.

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

For a coding test, the simplest fix is adding a personal access token as a header. That bumps the limit from 60 to 5,000 requests per hour. Store the token in `local.properties` or `BuildConfig` -- never hardcoded in source. Hardcoded tokens in a coding test submission is a red flag interviewers notice.

> **🧠 Think about it:** Your interceptor detects the rate limit is hit and `X-RateLimit-Reset` says 45 seconds from now. Should you show an error, silently retry after the reset, or serve cached data? What would give the best user experience?

#### What's the difference between the StackOverflow and GitHub API response structures?

These two APIs wrap their responses differently, and it matters for pagination logic. StackOverflow wraps everything in an envelope with `items`, `has_more`, and `quota_remaining`. GitHub's search API wraps results in `total_count` and `items`. But here's the twist -- GitHub's non-search endpoints (like "get user repos") return raw arrays with no wrapper at all.

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

This means your `PagingSource` uses `hasMore` for StackOverflow and checks if `items` is empty for GitHub. My advice for a timed test -- pick one API and build it correctly rather than trying to support both and doing neither well.

#### How do you unit test the ViewModel?

Use a fake repository, not a mock. Fakes are simpler to reason about -- you set up known data, create the ViewModel, and assert the UI state transitions. No `when().thenReturn()` chains that break every time you refactor.

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

`MainDispatcherRule` replaces `Dispatchers.Main` with `UnconfinedTestDispatcher` so coroutines run synchronously in tests. Without it, your test would try to use Android's main looper, which doesn't exist in a JVM test environment. Instant crash.

### Common Follow-ups

- How would you add sorting options (by stars, by name, by recently updated)?
- How would you handle the StackOverflow API's quota system in a production app?
- What's your approach to testing the PagingSource directly?
- How would you add a bookmarks/favorites feature that stores repos locally?
- How do you handle the case where the search API returns thousands of results?
- What would you change if the app needed to support both GitHub and StackOverflow?
- How would you implement pull-to-refresh with Paging 3?
