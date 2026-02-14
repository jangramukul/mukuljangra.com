---
title: "Build a To-Do / Notes App"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 7
sequence: 75
description: "The to-do or notes app is the purest test of Android fundamentals — Room, state management, clean architecture, and UI polish without relying on any external API."
---

## Build a To-Do / Notes App

Everything runs locally in a notes app. No external API to hide behind — it's a direct test of Room, CRUD, state management, and how cleanly you structure code.

#### How do you set up Room for a notes app?

I define an entity, a DAO with suspend functions for CRUD, and a database class. Room generates the implementation at compile time.

```kotlin
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val content: String,
    val priority: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id")
    suspend fun getById(id: Long): NoteEntity?

    @Insert
    suspend fun insert(note: NoteEntity): Long

    @Update
    suspend fun update(note: NoteEntity)

    @Delete
    suspend fun delete(note: NoteEntity)
}

@Database(entities = [NoteEntity::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao
}
```

The list query returns `Flow<List<NoteEntity>>` so the UI updates automatically when the database changes. Individual operations like `insert` and `delete` are suspend functions since they're one-shot.

#### How do you display notes in a LazyColumn?

I collect the `Flow` from the DAO in the ViewModel, expose it as `StateFlow`, and render each note as a card in a `LazyColumn`.

```kotlin
@Composable
fun NoteListScreen(
    notes: List<Note>,
    onNoteClick: (Long) -> Unit,
    onAddClick: () -> Unit
) {
    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = onAddClick) {
                Icon(Icons.Default.Add, contentDescription = "Add note")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(items = notes, key = { it.id }) { note ->
                NoteCard(note = note, onClick = { onNoteClick(note.id) })
            }
        }
    }
}
```

Setting `key = { it.id }` is important. Without it, Compose tracks items by position, so swipe-to-delete and reordering break.

#### How do you implement swipe-to-delete?

I use `SwipeToDismissBox` from Material 3. It wraps each list item and handles the gesture. On dismiss, I delete the note and show a Snackbar with undo.

```kotlin
@Composable
fun SwipeableNoteCard(
    note: Note,
    onDelete: (Note) -> Unit,
    onClick: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete(note)
                true
            } else false
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.error)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(Icons.Default.Delete, contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.onError)
            }
        }
    ) {
        NoteCard(note = note, onClick = onClick)
    }
}
```

`EndToStart` means swiping right to left, which is the standard delete gesture on Android.

#### How do you implement undo delete with a Snackbar?

I hold a reference to the last deleted note. If the user taps "Undo" on the Snackbar, I re-insert it. If the Snackbar dismisses, the delete stays.

```kotlin
class NoteListViewModel(
    private val repository: NoteRepository
) : ViewModel() {
    private var lastDeletedNote: Note? = null

    fun deleteNote(note: Note) {
        lastDeletedNote = note
        viewModelScope.launch {
            repository.delete(note)
        }
    }

    fun undoDelete() {
        lastDeletedNote?.let { note ->
            viewModelScope.launch {
                repository.insert(note)
                lastDeletedNote = null
            }
        }
    }
}
```

The composable uses `SnackbarHostState` to show the Snackbar with an action button. The ViewModel doesn't know about Snackbars — it just exposes `deleteNote()` and `undoDelete()`.

#### How do you build the add/edit note screen with form validation?

I use one screen for both add and edit. If a note ID comes through navigation, I load the existing note. I validate that the title isn't blank before saving.

```kotlin
@HiltViewModel
class NoteEditViewModel @Inject constructor(
    private val repository: NoteRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {
    private val noteId: Long? = savedStateHandle.get<Long>("noteId")

    var title by mutableStateOf("")
        private set
    var content by mutableStateOf("")
        private set
    var titleError by mutableStateOf<String?>(null)
        private set

    init {
        noteId?.let { loadNote(it) }
    }

    private fun loadNote(id: Long) {
        viewModelScope.launch {
            repository.getById(id)?.let { note ->
                title = note.title
                content = note.content
            }
        }
    }

    fun onTitleChanged(value: String) {
        title = value
        titleError = null
    }

    fun onContentChanged(value: String) { content = value }

    fun save(): Boolean {
        if (title.isBlank()) {
            titleError = "Title cannot be empty"
            return false
        }
        viewModelScope.launch {
            if (noteId != null) {
                repository.update(noteId, title.trim(), content.trim())
            } else {
                repository.insert(title.trim(), content.trim())
            }
        }
        return true
    }
}
```

`save()` returns a boolean so the UI knows whether to navigate back. I clear `titleError` when the user types again for immediate feedback.

#### How do you implement search and filter for notes?

I combine the search query with the notes flow using `combine`. Since all data is local, client-side filtering is simple and fast enough for typical note counts.

```kotlin
class NoteListViewModel(
    private val repository: NoteRepository
) : ViewModel() {
    private val _query = MutableStateFlow("")
    private val allNotes = repository.observeAll()

    val filteredNotes: StateFlow<List<Note>> = combine(
        allNotes, _query
    ) { notes, query ->
        if (query.isBlank()) notes
        else notes.filter { note ->
            note.title.contains(query, ignoreCase = true) ||
            note.content.contains(query, ignoreCase = true)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun onQueryChanged(query: String) { _query.value = query }
}
```

`combine` re-runs the filter whenever either the notes or the query changes. If a note is added while a search is active, the results update automatically. I could also use Room's `LIKE` query, but client-side is simpler here.

#### How do you implement sorting by date or priority?

I add a sort option as a `StateFlow` and combine it with the notes flow. An enum defines the sort types.

```kotlin
enum class SortOrder { DATE_NEWEST, DATE_OLDEST, PRIORITY_HIGH, PRIORITY_LOW }

class NoteListViewModel(
    private val repository: NoteRepository
) : ViewModel() {
    private val _sortOrder = MutableStateFlow(SortOrder.DATE_NEWEST)

    val sortedNotes: StateFlow<List<Note>> = combine(
        repository.observeAll(), _sortOrder
    ) { notes, order ->
        when (order) {
            SortOrder.DATE_NEWEST -> notes.sortedByDescending { it.updatedAt }
            SortOrder.DATE_OLDEST -> notes.sortedBy { it.updatedAt }
            SortOrder.PRIORITY_HIGH -> notes.sortedByDescending { it.priority }
            SortOrder.PRIORITY_LOW -> notes.sortedBy { it.priority }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun onSortChanged(order: SortOrder) { _sortOrder.value = order }
}
```

I could sort in the Room query with `ORDER BY`, but doing it in the ViewModel makes it easier to combine with search filtering without writing multiple DAO methods.

#### How do you structure clean architecture for a notes app?

I separate data, domain, and presentation layers even for a small app. It keeps the code testable. The domain layer is thin — just the model and a repository interface.

```kotlin
// Domain layer
data class Note(
    val id: Long = 0,
    val title: String,
    val content: String,
    val priority: Int = 0,
    val createdAt: Long = 0,
    val updatedAt: Long = 0
)

interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    suspend fun getById(id: Long): Note?
    suspend fun insert(title: String, content: String): Long
    suspend fun update(id: Long, title: String, content: String)
    suspend fun delete(note: Note)
}

// Data layer
class NoteRepositoryImpl(
    private val dao: NoteDao
) : NoteRepository {
    override fun observeAll(): Flow<List<Note>> =
        dao.observeAll().map { entities -> entities.map { it.toDomain() } }

    override suspend fun insert(title: String, content: String): Long {
        val entity = NoteEntity(title = title, content = content)
        return dao.insert(entity)
    }
    // ... other methods
}
```

Use cases are optional here. If a use case just calls one repository method, it's unnecessary indirection. I'd add them only when combining multiple repositories or applying real business rules.

#### How do you set up Hilt for dependency injection?

I create a module that provides the Room database, DAO, and repository. The ViewModel gets `@HiltViewModel` and the repository is injected through the constructor.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(context, AppDatabase::class.java, "notes.db")
            .build()
    }

    @Provides
    fun provideNoteDao(database: AppDatabase): NoteDao = database.noteDao()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindNoteRepository(impl: NoteRepositoryImpl): NoteRepository
}
```

I use `@Binds` for interface-to-implementation bindings. It's more efficient than `@Provides` because Dagger doesn't create a wrapper method.

#### How do you handle offline-first architecture in a notes app?

A notes app is offline-first by default since Room is the primary data store. The real question is whether to add cloud sync. If sync is needed, I treat Room as the source of truth and sync in the background.

The pattern is: write to Room immediately, queue the sync with WorkManager, and handle conflicts when the response comes back. The user never waits for a network call. If cloud sync isn't in scope, the architecture is just Room with `Flow` — the simplest form.

#### How do you support dark mode?

I use Material 3 theming. I define a theme composable that switches between light and dark color schemes based on the system setting.

```kotlin
@Composable
fun NotesAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
```

I use `MaterialTheme.colorScheme.surface`, `onSurface`, `primary`, etc. everywhere instead of hardcoded colors. For user-controlled dark mode beyond the system setting, I store the preference in DataStore and pass it to the theme composable.

#### How do you unit test the ViewModel?

I create a fake repository, pass it to the ViewModel, and assert on the `StateFlow` emissions.

```kotlin
class NoteListViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepository = FakeNoteRepository()

    @Test
    fun `displays all notes on load`() = runTest {
        fakeRepository.addNote(Note(id = 1, title = "Buy groceries", content = ""))
        fakeRepository.addNote(Note(id = 2, title = "Read book", content = ""))
        val viewModel = NoteListViewModel(fakeRepository)

        val result = viewModel.filteredNotes.first()
        assertThat(result).hasSize(2)
    }

    @Test
    fun `filters notes by search query`() = runTest {
        fakeRepository.addNote(Note(id = 1, title = "Buy groceries", content = ""))
        fakeRepository.addNote(Note(id = 2, title = "Read book", content = ""))
        val viewModel = NoteListViewModel(fakeRepository)

        viewModel.onQueryChanged("book")
        val result = viewModel.filteredNotes.first()
        assertThat(result).hasSize(1)
        assertThat(result[0].title).isEqualTo("Read book")
    }
}
```

The fake repository uses a `MutableStateFlow<List<Note>>` internally so it behaves like the real one. This is simpler than mocking Room's `Flow` return type.

#### How do you write UI tests for the notes app?

I use `ComposeTestRule` to render composables and interact with them. I test the core flows: adding a note, seeing it in the list, editing, deleting.

```kotlin
@HiltAndroidTest
class NoteListScreenTest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun addNote_appearsInList() {
        composeRule.onNodeWithContentDescription("Add note").performClick()
        composeRule.onNodeWithTag("title_field").performTextInput("Test Note")
        composeRule.onNodeWithTag("content_field").performTextInput("Some content")
        composeRule.onNodeWithText("Save").performClick()

        composeRule.onNodeWithText("Test Note").assertIsDisplayed()
    }
}
```

I use `testTag` for input fields since they don't always have visible text to match on. UI tests should focus on user-visible behavior, not implementation details.

#### Why is the to-do app a good test of fundamentals?

It strips away networking complexity and exposes core skills directly. Room setup, state management, navigation, UI code — everything is visible. The evaluator can see how I handle CRUD, form validation, state persistence across config changes, and edge cases like empty lists.

It also reveals product thinking. Do I add a FAB or hide the action in a menu? Do I handle back press during editing? Do I confirm before deleting? These UX details aren't in the requirements but they show how I think about the full experience.

#### How do you handle the back press when editing a note with unsaved changes?

I track whether the form has been modified and intercept back navigation with `BackHandler`. If there are unsaved changes, I show a confirmation dialog.

```kotlin
@Composable
fun NoteEditScreen(
    viewModel: NoteEditViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    var showDiscardDialog by remember { mutableStateOf(false) }
    val hasChanges = viewModel.title.isNotBlank() || viewModel.content.isNotBlank()

    BackHandler(enabled = hasChanges) {
        showDiscardDialog = true
    }

    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = { showDiscardDialog = false },
            title = { Text("Discard changes?") },
            text = { Text("You have unsaved changes.") },
            confirmButton = {
                TextButton(onClick = onNavigateBack) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardDialog = false }) { Text("Keep editing") }
            }
        )
    }
    // ... rest of the edit screen
}
```

Most candidates skip this. It's a small detail but it shows I think about the full user experience, not just the happy path.

### Common Follow-ups

- How would you add categories or tags to notes?
- How do you handle Room database migrations when adding a new column?
- How would you implement a rich text editor for note content?
- What's the difference between `OnConflictStrategy.REPLACE` and `ABORT` in Room?
- How would you sync notes across devices using a backend?
- How do you test Room database operations directly?
- How would you implement a pinned notes feature that keeps certain notes at the top of the list?
