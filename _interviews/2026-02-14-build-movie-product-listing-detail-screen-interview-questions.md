---
title: "Build a Movie / Product Listing with Detail Screen"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 3
level: mid
sequence: 48
---

## Build a Movie / Product Listing with Detail Screen

The list-detail pattern is a staple coding test assignment. It tests navigation, data loading, image handling, pagination, and how cleanly you separate concerns between screens.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the master-detail pattern and why is it common in coding tests?

Master-detail is a two-screen pattern where the first screen shows a list of items (movies, products, articles) and tapping an item opens a detail screen with full information. It's common because it covers core Android concepts — list rendering, navigation with data passing, network calls, image loading, and state management — all in a small, evaluable scope.

#### Q2: How do you build a scrollable list using LazyColumn in Compose?

`LazyColumn` only composes items that are currently visible on screen, which makes it efficient for long lists. Each item gets composed when it scrolls into view and disposed when it scrolls out.

```kotlin
@Composable
fun MovieListScreen(
    movies: List<Movie>,
    onMovieClick: (Int) -> Unit
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = movies,
            key = { movie -> movie.id }
        ) { movie ->
            MovieCard(
                movie = movie,
                onClick = { onMovieClick(movie.id) }
            )
        }
    }
}
```

Always provide a `key` for each item. Without keys, Compose tracks items by position, so any reordering destroys and recreates item state. With keys, Compose can track items across position changes and preserve their state.

#### Q3: How do you build the same list using RecyclerView in XML?

Create a `RecyclerView.Adapter` with a `ViewHolder`. Use `ListAdapter` with `DiffUtil` for efficient updates — it calculates the difference between old and new lists and only updates changed items.

```kotlin
class MovieAdapter(
    private val onClick: (Int) -> Unit
) : ListAdapter<Movie, MovieAdapter.MovieViewHolder>(MovieDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MovieViewHolder {
        val binding = ItemMovieBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return MovieViewHolder(binding)
    }

    override fun onBindViewHolder(holder: MovieViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class MovieViewHolder(
        private val binding: ItemMovieBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(movie: Movie) {
            binding.title.text = movie.title
            binding.root.setOnClickListener { onClick(movie.id) }
        }
    }
}

class MovieDiffCallback : DiffUtil.ItemCallback<Movie>() {
    override fun areItemsTheSame(old: Movie, new: Movie) = old.id == new.id
    override fun areContentsTheSame(old: Movie, new: Movie) = old == new
}
```

`DiffUtil` is important — submitting a new list recalculates only the diff, so RecyclerView animates additions, removals, and moves automatically instead of refreshing the entire list.

#### Q4: How do you handle navigation from the list screen to the detail screen?

Use Jetpack Navigation with a single-activity architecture. Pass the item ID to the detail screen, not the entire object — the detail screen loads its own data from the repository.

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "movies") {
        composable("movies") {
            MovieListScreen(
                onMovieClick = { movieId ->
                    navController.navigate("movies/$movieId")
                }
            )
        }
        composable(
            route = "movies/{movieId}",
            arguments = listOf(navArgument("movieId") { type = NavType.IntType })
        ) { backStackEntry ->
            val movieId = backStackEntry.arguments?.getInt("movieId") ?: return@composable
            MovieDetailScreen(movieId = movieId)
        }
    }
}
```

Passing the ID instead of the full object avoids serialization issues and ensures the detail screen always has fresh data. The detail ViewModel fetches the movie by ID from the same repository.

#### Q5: How do you load images with Coil in a list?

Add the Coil Compose dependency and use `AsyncImage`. Coil handles memory caching, disk caching, request deduplication, and lifecycle-aware loading automatically.

```kotlin
@Composable
fun MovieCard(movie: Movie, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(modifier = Modifier.padding(12.dp)) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(movie.posterUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = movie.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
            )
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(text = movie.title, style = MaterialTheme.typography.titleMedium)
                Text(text = movie.year, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
```

Use `crossfade(true)` for a smooth transition from placeholder to loaded image. Set `contentScale = ContentScale.Crop` for consistent image sizing in list items.

#### Q6: How do you handle the data layer architecture for a list-detail feature?

The repository provides a single point of access for movie data. It decides whether to fetch from network or return cached data. Both the list and detail screens use the same repository.

```kotlin
class MovieRepository(
    private val api: MovieApi,
    private val dao: MovieDao
) {
    fun getMovies(): Flow<Resource<List<Movie>>> = flow {
        emit(Resource.Loading)

        val cached = dao.getAllMovies().map { it.toDomain() }
        if (cached.isNotEmpty()) emit(Resource.Success(cached))

        try {
            val remote = api.getPopularMovies()
            dao.insertMovies(remote.results.map { it.toEntity() })
            val updated = dao.getAllMovies().map { it.toDomain() }
            emit(Resource.Success(updated))
        } catch (e: IOException) {
            if (cached.isEmpty()) emit(Resource.Error("No internet connection"))
        }
    }

    suspend fun getMovieById(id: Int): Resource<MovieDetail> {
        return try {
            val response = api.getMovieDetail(id)
            Resource.Success(response.toDomain())
        } catch (e: Exception) {
            Resource.Error(e.message ?: "Failed to load movie details")
        }
    }
}
```

The list endpoint uses cache-then-network — show cached data immediately while fetching fresh data in the background. The detail endpoint can be network-only if the full detail data isn't cached.

### Deep Dive Questions (Advanced → Expert)

#### Q7: How do you implement infinite scroll with Paging 3?

Paging 3 handles pagination automatically — it loads the next page when the user scrolls near the end of the list. You define a `PagingSource` that knows how to load each page, and the library handles everything else.

```kotlin
class MoviePagingSource(
    private val api: MovieApi
) : PagingSource<Int, Movie>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, Movie> {
        val page = params.key ?: 1
        return try {
            val response = api.getPopularMovies(page = page)
            LoadResult.Page(
                data = response.results.map { it.toDomain() },
                prevKey = if (page == 1) null else page - 1,
                nextKey = if (response.results.isEmpty()) null else page + 1
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, Movie>): Int? {
        return state.anchorPosition?.let { position ->
            state.closestPageToPosition(position)?.prevKey?.plus(1)
                ?: state.closestPageToPosition(position)?.nextKey?.minus(1)
        }
    }
}
```

In the ViewModel, create a `Pager` and expose the result as a `Flow<PagingData<Movie>>`. In Compose, use `collectAsLazyPagingItems()` to render the paged list.

```kotlin
// ViewModel
val movies: Flow<PagingData<Movie>> = Pager(
    config = PagingConfig(pageSize = 20, prefetchDistance = 5)
) { MoviePagingSource(api) }.flow.cachedIn(viewModelScope)

// Composable
@Composable
fun MovieListScreen(viewModel: MovieViewModel = hiltViewModel()) {
    val movies = viewModel.movies.collectAsLazyPagingItems()

    LazyColumn {
        items(count = movies.itemCount, key = movies.itemKey { it.id }) { index ->
            val movie = movies[index] ?: return@items
            MovieCard(movie = movie, onClick = { /* navigate */ })
        }
    }
}
```

`cachedIn(viewModelScope)` is critical — without it, the paging data restarts from page 1 on configuration changes. With it, loaded pages survive rotation.

#### Q8: How do you implement search and filter in a list screen?

Combine the search query with the data source. For client-side filtering (when you have all data loaded), filter the list in the ViewModel. For server-side search, pass the query to the API.

```kotlin
class MovieViewModel(private val repository: MovieRepository) : ViewModel() {
    private val _query = MutableStateFlow("")
    private val _selectedGenre = MutableStateFlow<Genre?>(null)
    private val allMovies = repository.getMovies()

    val filteredMovies: StateFlow<Resource<List<Movie>>> = combine(
        allMovies, _query, _selectedGenre
    ) { resource, query, genre ->
        when (resource) {
            is Resource.Success -> {
                val filtered = resource.data
                    .filter { movie ->
                        query.isBlank() || movie.title.contains(query, ignoreCase = true)
                    }
                    .filter { movie ->
                        genre == null || movie.genres.contains(genre)
                    }
                Resource.Success(filtered)
            }
            else -> resource
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Resource.Loading)

    fun onQueryChanged(query: String) { _query.value = query }
    fun onGenreSelected(genre: Genre?) { _selectedGenre.value = genre }
}
```

`combine` merges all three sources reactively — when any of them changes, the filter re-runs. This is cleaner than manually triggering refiltering on each input change.

#### Q9: How do you handle state preservation on configuration changes?

ViewModel survives configuration changes, so anything stored in `StateFlow` or `MutableState` inside the ViewModel persists across rotation. For data that needs to survive process death, use `SavedStateHandle`.

```kotlin
class MovieViewModel(
    private val repository: MovieRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    val searchQuery = savedStateHandle.getStateFlow("query", "")
    val selectedGenre = savedStateHandle.getStateFlow<Genre?>("genre", null)

    fun onQueryChanged(query: String) {
        savedStateHandle["query"] = query
    }

    fun onGenreSelected(genre: Genre?) {
        savedStateHandle["genre"] = genre
    }
}
```

`SavedStateHandle.getStateFlow()` gives you a `StateFlow` that automatically persists to the saved state bundle. The user's search query and filter selection survive both rotation and process death without any extra work.

#### Q10: How do you implement shared element transitions between list and detail in Compose?

Compose supports shared element transitions through the `SharedTransitionLayout` and `AnimatedContent` APIs. You wrap your navigation with `SharedTransitionLayout` and mark elements that should animate between screens.

```kotlin
SharedTransitionLayout {
    AnimatedContent(targetState = selectedMovie) { movie ->
        if (movie == null) {
            MovieList(
                movies = movies,
                onMovieClick = { selectedMovie = it },
                animatedVisibilityScope = this@AnimatedContent,
                sharedTransitionScope = this@SharedTransitionLayout
            )
        } else {
            MovieDetail(
                movie = movie,
                onBack = { selectedMovie = null },
                animatedVisibilityScope = this@AnimatedContent,
                sharedTransitionScope = this@SharedTransitionLayout
            )
        }
    }
}
```

Shared element transitions are a bonus feature for coding tests — they demonstrate knowledge of newer Compose APIs. But don't add them at the cost of more important things like error handling and testing.

#### Q11: How do you design a clean navigation setup for a single-activity app?

Single-activity with Jetpack Navigation is the standard. Define all routes in one place and use sealed classes or objects for type-safe navigation.

```kotlin
sealed class Screen(val route: String) {
    data object MovieList : Screen("movies")
    data object MovieDetail : Screen("movies/{movieId}") {
        fun createRoute(movieId: Int) = "movies/$movieId"
    }
    data object Search : Screen("search")
}

@Composable
fun AppNavigation(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Screen.MovieList.route) {
        composable(Screen.MovieList.route) {
            MovieListScreen(
                onMovieClick = { id ->
                    navController.navigate(Screen.MovieDetail.createRoute(id))
                },
                onSearchClick = { navController.navigate(Screen.Search.route) }
            )
        }
        composable(
            route = Screen.MovieDetail.route,
            arguments = listOf(navArgument("movieId") { type = NavType.IntType })
        ) {
            MovieDetailScreen()
        }
        composable(Screen.Search.route) {
            SearchScreen(onMovieClick = { id ->
                navController.navigate(Screen.MovieDetail.createRoute(id))
            })
        }
    }
}
```

This structure keeps all navigation in one file, makes routes easy to find, and prevents hardcoded route strings scattered across the codebase. The ViewModel reads `movieId` from `SavedStateHandle` — Hilt injects it automatically from the navigation arguments.

#### Q12: How should the detail screen load its data?

The detail ViewModel takes the item ID from `SavedStateHandle` and fetches the full detail from the repository. Don't pass the entire object through navigation — pass only the ID.

```kotlin
@HiltViewModel
class MovieDetailViewModel @Inject constructor(
    private val repository: MovieRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {
    private val movieId: Int = checkNotNull(savedStateHandle["movieId"])

    val uiState: StateFlow<MovieDetailUiState> = flow {
        emit(MovieDetailUiState.Loading)
        when (val result = repository.getMovieById(movieId)) {
            is Resource.Success -> emit(MovieDetailUiState.Success(result.data))
            is Resource.Error -> emit(MovieDetailUiState.Error(result.message))
            else -> {}
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), MovieDetailUiState.Loading)
}
```

If the detail data is expensive to fetch, you can show the summary from the list while loading the full detail. Cache the summary in the repository or pass essential fields (title, poster URL) as navigation arguments for an instant preview.

#### Q13: What is the difference between client-side and server-side pagination?

Client-side pagination loads all data at once and pages through it locally. This works for small datasets (under a few hundred items) but wastes memory and bandwidth for large ones.

Server-side pagination loads one page at a time. The API returns a subset of results plus information about the next page (page number, cursor, or offset). Paging 3 handles server-side pagination through `PagingSource` — you tell it how to load a page and it manages prefetching, caching, and retry automatically.

For coding tests, server-side pagination with Paging 3 is the expected approach unless the dataset is small enough that you can load everything in one request.

#### Q14: How do you handle error states in a paged list?

Paging 3 exposes `LoadState` for each loading phase — refresh (initial load), prepend (loading previous pages), and append (loading next page). Handle each state in the UI.

```kotlin
@Composable
fun MovieListScreen(viewModel: MovieViewModel = hiltViewModel()) {
    val movies = viewModel.movies.collectAsLazyPagingItems()

    LazyColumn {
        items(count = movies.itemCount, key = movies.itemKey { it.id }) { index ->
            val movie = movies[index] ?: return@items
            MovieCard(movie = movie)
        }

        // Append loading indicator
        if (movies.loadState.append is LoadState.Loading) {
            item { CircularProgressIndicator(modifier = Modifier.padding(16.dp)) }
        }

        // Append error with retry
        if (movies.loadState.append is LoadState.Error) {
            item {
                RetryButton(
                    message = "Failed to load more",
                    onRetry = { movies.retry() }
                )
            }
        }
    }

    // Full screen error for refresh failure
    if (movies.loadState.refresh is LoadState.Error && movies.itemCount == 0) {
        ErrorScreen(
            message = "Failed to load movies",
            onRetry = { movies.refresh() }
        )
    }
}
```

Showing a loading indicator at the bottom of the list while the next page loads and a retry button if it fails is expected behavior. Most candidates handle the initial load state but forget about append errors.

#### Q15: How do you optimize image loading in a large list?

Use Coil's built-in optimizations and add a few extras for list performance. Set a fixed image size to avoid loading full-resolution images, use placeholders to prevent layout shifts, and let Coil handle memory and disk caching.

Configure the `ImageLoader` globally with appropriate cache sizes:

```kotlin
val imageLoader = ImageLoader.Builder(context)
    .memoryCache {
        MemoryCache.Builder()
            .maxSizePercent(context, 0.25) // 25% of available memory
            .build()
    }
    .diskCache {
        DiskCache.Builder()
            .directory(context.cacheDir.resolve("image_cache"))
            .maxSizeBytes(50L * 1024 * 1024) // 50 MB
            .build()
    }
    .crossfade(true)
    .build()
```

In list items, specify `size()` in the image request to avoid decoding at full resolution. A thumbnail in a list doesn't need a 4000x3000 pixel image — loading it at that size wastes memory and causes scroll jank.

### Common Follow-ups

- How would you implement a favorites feature that persists across app restarts?
- What's the difference between `LazyColumn` and `RecyclerView` in terms of performance?
- How do you handle deep linking directly to a detail screen?
- How would you add pull-to-refresh to a paged list?
- What caching strategy would you use for movie poster images?
- How do you handle the case where the detail API call fails but you have list-level data?
- How would you test the navigation flow between list and detail screens?
