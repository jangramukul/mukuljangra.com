---
title: "Build a Movie / Product Listing with Detail Screen"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 3
sequence: 71
description: "The list-detail pattern is a staple coding test assignment."
---

## Build a Movie / Product Listing with Detail Screen

The list-detail pattern is the most common coding test assignment. It covers navigation, data loading, image handling, pagination, and separation of concerns in a small scope.

#### What is the master-detail pattern and why is it common in coding tests?

It's a two-screen pattern. The first screen shows a list of items (movies, products, articles) and tapping an item opens a detail screen with full information. It's popular because it touches core Android concepts — list rendering, navigation, network calls, image loading, and state management — all in one small project.

#### How do you build a scrollable list using LazyColumn in Compose?

`LazyColumn` only composes items visible on screen. Items get composed when they scroll into view and disposed when they scroll out.

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

Always provide a `key`. Without keys, Compose tracks items by position — any reordering destroys and recreates item state. With keys, Compose tracks items across position changes and preserves state.

#### How do you build the same list using RecyclerView?

I use `ListAdapter` with `DiffUtil`. `ListAdapter` extends `RecyclerView.Adapter` and calculates the difference between old and new lists automatically, so only changed items get updated.

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

`DiffUtil` recalculates only the diff, so RecyclerView animates additions, removals, and moves instead of refreshing everything.

#### How do you handle navigation from the list screen to the detail screen?

I use Jetpack Navigation with a single-activity setup. I pass just the item ID to the detail screen — the detail screen fetches its own data from the repository.

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

Passing the ID instead of the full object avoids serialization issues and ensures the detail screen always shows fresh data.

#### How do you load images with Coil in a list?

I use `AsyncImage` from the Coil Compose library. Coil handles memory caching, disk caching, request deduplication, and lifecycle-aware loading out of the box.

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

`crossfade(true)` gives a smooth transition from placeholder to loaded image. `ContentScale.Crop` keeps image sizing consistent across list items.

#### How do you structure the data layer for a list-detail feature?

I use a repository that acts as a single source of truth for both screens. It decides whether to fetch from network or return cached data.

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

The list uses cache-then-network — show cached data immediately, fetch fresh data in the background. The detail endpoint can be network-only if I don't cache full detail data locally.

#### How should the detail screen load its data?

The detail ViewModel reads the item ID from `SavedStateHandle` and fetches the full detail from the repository.

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

If the detail data is expensive to fetch, I can show the list-level summary immediately while loading the full detail. I pass essential fields (title, poster URL) as navigation arguments for an instant preview.

#### How do you implement infinite scroll with Paging 3?

I define a `PagingSource` that knows how to load each page. Paging 3 handles the rest — it loads the next page automatically when the user scrolls near the end.

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

In the ViewModel, I create a `Pager` and expose the result as `Flow<PagingData<Movie>>`. In Compose, I collect it with `collectAsLazyPagingItems()`.

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

`cachedIn(viewModelScope)` is critical. Without it, paging data restarts from page 1 on configuration changes. With it, loaded pages survive rotation.

#### How do you implement search and filter in a list screen?

I combine the search query and filter selection with the data source using `combine`. When any input changes, the filter re-runs automatically.

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

This is for client-side filtering when all data is already loaded. For server-side search, I'd pass the query to the API instead and let the backend handle it.

#### How do you handle state preservation on configuration changes?

ViewModel survives configuration changes, so `StateFlow` values persist across rotation. For data that also needs to survive process death, I use `SavedStateHandle`.

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

`SavedStateHandle.getStateFlow()` returns a `StateFlow` that automatically persists to the saved state bundle. The search query and filter survive both rotation and process death.

#### How do you design a clean navigation setup for a single-activity app?

I define all routes in one place using sealed classes for type safety. This avoids hardcoded route strings scattered across the codebase.

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

The ViewModel reads `movieId` from `SavedStateHandle` — Hilt injects it automatically from the navigation arguments.

#### What is the difference between client-side and server-side pagination?

Client-side pagination loads all data at once and pages through it locally. This works for small datasets but wastes memory and bandwidth for large ones.

Server-side pagination loads one page at a time. The API returns a subset of results plus info about the next page (page number, cursor, or offset). Paging 3 handles this through `PagingSource` — I tell it how to load a page and it manages prefetching, caching, and retry. For coding tests, server-side pagination with Paging 3 is the expected approach unless the dataset is small enough to load in one request.

#### How do you handle error states in a paged list?

Paging 3 exposes `LoadState` for each phase — refresh (initial load), prepend, and append (next page). I handle each one in the UI.

```kotlin
@Composable
fun MovieListScreen(viewModel: MovieViewModel = hiltViewModel()) {
    val movies = viewModel.movies.collectAsLazyPagingItems()

    LazyColumn {
        items(count = movies.itemCount, key = movies.itemKey { it.id }) { index ->
            val movie = movies[index] ?: return@items
            MovieCard(movie = movie)
        }

        if (movies.loadState.append is LoadState.Loading) {
            item { CircularProgressIndicator(modifier = Modifier.padding(16.dp)) }
        }

        if (movies.loadState.append is LoadState.Error) {
            item {
                RetryButton(
                    message = "Failed to load more",
                    onRetry = { movies.retry() }
                )
            }
        }
    }

    if (movies.loadState.refresh is LoadState.Error && movies.itemCount == 0) {
        ErrorScreen(
            message = "Failed to load movies",
            onRetry = { movies.refresh() }
        )
    }
}
```

I show a loading indicator at the bottom while the next page loads and a retry button if it fails. For a full refresh failure with no cached data, I show a full-screen error with retry.

#### How do you optimize image loading in a large list?

I configure the `ImageLoader` globally with appropriate cache sizes and use fixed image dimensions in list items to avoid decoding full-resolution images.

```kotlin
val imageLoader = ImageLoader.Builder(context)
    .memoryCache {
        MemoryCache.Builder()
            .maxSizePercent(context, 0.25)
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

A thumbnail in a list doesn't need a 4000x3000 pixel image. I specify `size()` in the image request so Coil decodes at the display size, not the original resolution. Loading full-resolution images in a list wastes memory and causes scroll jank.

### Common Follow-ups

- How would you implement a favorites feature that persists across app restarts?
- What's the difference between `LazyColumn` and `RecyclerView` in terms of performance?
- How do you handle deep linking directly to a detail screen?
- How would you add pull-to-refresh to a paged list?
- What caching strategy would you use for movie poster images?
- How do you handle the case where the detail API call fails but you have list-level data?
- How would you test the navigation flow between list and detail screens?
