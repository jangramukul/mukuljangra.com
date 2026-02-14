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

The list-detail pattern is the bread and butter of Android coding tests. Think of it like a restaurant menu -- you browse a list of dishes, tap one, and get the full recipe. It's popular because in one small project you're touching list rendering, navigation, network calls, image loading, and state management. If you can build this well, you can build most Android apps.

#### What is the master-detail pattern and why is it common in coding tests?

Two screens. The first one shows a list of items -- movies, products, articles, whatever. Tap an item and you land on a detail screen with the full picture. It's the Swiss Army knife of coding tests because it forces you to demonstrate core Android skills all at once: list rendering, navigation, network calls, image loading, and state management. One small project, many concepts. That's why interviewers love it.

#### How do you build a scrollable list using LazyColumn in Compose?

Here's the thing about `LazyColumn` -- it's lazy in the best possible way. It only composes the items you can actually see on screen. Items get composed when they scroll into view and disposed when they scroll out. It's like a restaurant that only cooks dishes when someone orders them, not the entire menu upfront.

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

Always provide a `key`. Without keys, Compose tracks items by position -- so if your list reorders, it destroys and recreates item state like a librarian who shelves books by slot number instead of ISBN. With keys, Compose tracks items across position changes and preserves their state.

#### How do you build the same list using RecyclerView?

I use `ListAdapter` with `DiffUtil`. Think of `DiffUtil` as a smart assistant that compares the old and new guest lists and tells you "these 3 people are new, this one left, and those two swapped seats" -- instead of making you recheck everyone.

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

Because `DiffUtil` only recalculates the diff, RecyclerView can animate additions, removals, and moves instead of nuking the whole list and rebuilding it.

#### How do you handle navigation from the list screen to the detail screen?

I use Jetpack Navigation with a single-activity setup. The key decision here: I only pass the item ID to the detail screen, not the whole object. The detail screen fetches its own data from the repository.

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

Why just the ID? Passing the full object means serialization headaches and stale data. With just an ID, the detail screen always fetches fresh data and you sidestep the whole "is my parcelable up to date?" problem.

> **🧠 Think about it:** If you passed the entire Movie object to the detail screen, what happens when the user goes back, pulls to refresh, and taps the same movie again -- but the data changed on the server?

#### How do you load images with Coil in a list?

I use `AsyncImage` from the Coil Compose library. Coil is like having a personal assistant who handles memory caching, disk caching, request deduplication, and lifecycle-aware loading -- all without you asking.

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

`crossfade(true)` gives you a smooth fade from placeholder to loaded image instead of the jarring pop-in. `ContentScale.Crop` keeps your thumbnails uniform -- no weird stretching across list items.

#### How do you structure the data layer for a list-detail feature?

I use a repository that acts as the single source of truth for both screens. Think of it as a concierge -- you ask for movies, and the concierge decides whether to check the local cache or call the network. You don't care how it gets the data, you just get it.

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

The list uses a cache-then-network strategy -- show what you have immediately, then quietly fetch fresh data in the background. The detail endpoint can be network-only if you don't need to cache full detail data locally.

#### How should the detail screen load its data?

The detail ViewModel grabs the item ID from `SavedStateHandle` and fetches the full detail from the repository. No magic -- Hilt injects the navigation arguments into `SavedStateHandle` automatically.

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

Now here's a nice trick: if the detail data is expensive to fetch, you can show the list-level summary immediately while the full detail loads. Pass the essential fields (title, poster URL) as navigation arguments so the user sees something instantly instead of staring at a spinner.

#### How do you implement infinite scroll with Paging 3?

I define a `PagingSource` that knows how to load each page. Paging 3 handles everything else -- it's like a book that automatically flips to the next chapter when you reach the bottom of the page.

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

In the ViewModel, I create a `Pager` and expose it as `Flow<PagingData<Movie>>`. In Compose, I collect it with `collectAsLazyPagingItems()`.

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

`cachedIn(viewModelScope)` is the line that saves you during a coding test. Without it, paging data restarts from page 1 every time the user rotates the device. With it, loaded pages survive configuration changes. Forget this line and your interviewer will notice.

> **🧠 Think about it:** What would happen if you created a new `PagingSource` instance inside a composable function instead of the ViewModel? How many times would page 1 get fetched?

#### How do you implement search and filter in a list screen?

I combine the search query and filter selection with the data source using `combine`. It's like a coffee order -- whenever you change the size, the milk, or the flavor, the barista makes a new drink. Same idea: whenever any input changes, the filter re-runs automatically.

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

This is client-side filtering -- it works when all the data is already loaded in memory. For large datasets, you'd pass the query to the API and let the backend handle the filtering instead.

#### How do you handle state preservation on configuration changes?

ViewModel survives configuration changes, so your `StateFlow` values persist across rotation. But here's where it gets interesting -- ViewModel does not survive process death. For data that needs to survive both, I use `SavedStateHandle`.

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

`SavedStateHandle.getStateFlow()` returns a `StateFlow` that automatically persists to the saved state bundle. The user's search query and genre filter survive rotation and process death. Without it, your user types "Interstellar", rotates the phone, and the search bar is blank. Not a great look in a coding test.

#### How do you design a clean navigation setup for a single-activity app?

I define all routes in one place using sealed classes. Think of it like an airport departure board -- all destinations listed in one spot, type-safe, no chance of typos in gate numbers.

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

This avoids hardcoded route strings scattered across the codebase. The ViewModel reads `movieId` from `SavedStateHandle` -- Hilt injects it automatically from the navigation arguments.

#### What is the difference between client-side and server-side pagination?

Client-side pagination loads all the data at once and pages through it in memory. It's like downloading an entire encyclopedia to read one article. Works fine for small datasets, but for thousands of items it wastes memory and bandwidth.

Server-side pagination loads one page at a time. The API returns a subset of results plus a pointer to the next page (page number, cursor, or offset). Paging 3 handles this through `PagingSource` -- you tell it how to load a page and it manages prefetching, caching, and retry. For coding tests, server-side pagination with Paging 3 is the expected approach unless the dataset is small enough to fit in a single request.

#### How do you handle error states in a paged list?

Paging 3 exposes `LoadState` for three distinct phases -- refresh (the initial load), prepend, and append (loading the next page). Each phase can independently be loading, error, or not loading, so you handle them separately in the UI.

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

A loading spinner at the bottom while the next page loads, a retry button if that fails, and a full-screen error if the initial load bombs with no cached data. Cover these three scenarios and your error handling is solid.

> **🧠 Think about it:** What should your UI show if `refresh` succeeds but `append` fails -- and the user hasn't scrolled far enough to see the error item at the bottom of the list?

#### How do you optimize image loading in a large list?

I configure the `ImageLoader` globally with sensible cache sizes and use fixed dimensions in list items. The goal: never decode a full-resolution image when a tiny thumbnail will do.

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

Your list thumbnail is 80dp wide. It does not need a 4000x3000 pixel image decoded into memory. I specify `size()` in the image request so Coil decodes at the display size, not the original resolution. Loading full-res images in a scrolling list is like shipping a piano when someone asked for a music box -- it wastes memory and causes scroll jank.

### Common Follow-ups

- How would you implement a favorites feature that persists across app restarts?
- What's the difference between `LazyColumn` and `RecyclerView` in terms of performance?
- How do you handle deep linking directly to a detail screen?
- How would you add pull-to-refresh to a paged list?
- What caching strategy would you use for movie poster images?
- How do you handle the case where the detail API call fails but you have list-level data?
- How would you test the navigation flow between list and detail screens?
