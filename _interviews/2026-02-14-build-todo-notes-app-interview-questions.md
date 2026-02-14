---
title: "Build a To-Do / Notes App"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 7
sequence: 78
description: "The to-do or notes app is the purest test of Android fundamentals — Room, state management, clean architecture, and UI polish without relying on any external API."
---

## Build a To-Do / Notes App

The to-do or notes app is the purest test of Android fundamentals. There's no external API to blame for issues — everything runs locally. It tests Room, CRUD operations, state management, form validation, and how cleanly you structure code when the scope is small but the expectations are high.

### Core Questions (Beginner → Intermediate)

#### Q1: How do you set up Room for a notes app?

Define an entity for the note, a DAO with suspend functions for CRUD operations, and a database class. Room generates the implementation at compile time from these annotations.

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

The DAO returns `Flow<List<NoteEntity>>` for the list query so the UI updates automatically whenever the database changes. Individual operations like `insert` and `delete` are suspend functions.

#### Q2: How do you display notes in a LazyColumn?

Collect the `Flow` from the DAO in the ViewModel and expose it as `StateFlow`. The composable renders each note as a card in a `LazyColumn`.

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

The `key = { it.id }` is important for animations and state preservation. Without it, swipe-to-delete and reordering won't work correctly because Compose tracks items by position.

#### Q3: How do you implement swipe-to-delete?

Use the `SwipeToDismissBox` composable from Material 3. It wraps each list item and handles the swipe gesture. On dismiss, delete the note and show a Snackbar with an undo option.

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

The swipe direction matters. `EndToStart` means swiping from right to left, which is the standard delete gesture.

#### Q4: How do you implement undo delete with a Snackbar?

When the user deletes a note, save a reference to it and show a Snackbar. If they tap "Undo," re-insert the note. If the Snackbar dismisses, the delete is final.

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

In the composable, use `SnackbarHostState` and show the Snackbar with an action button. The ViewModel doesn't need to know about Snackbars — it just exposes `deleteNote()` and `undoDelete()`.

#### Q5: How do you build the add/edit note screen with form validation?

Use a single screen for both adding and editing. If a note ID is passed through navigation, load the existing note. Validate that the title is not empty before saving.

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

The `save()` function returns a boolean so the UI knows whether to navigate back. Clearing `titleError` when the user types again gives immediate feedback.

#### Q6: How do you implement search and filter for notes?

Combine the search query with the notes flow. Filter on the client side since all data is local. Room's `LIKE` query works too, but client-side filtering is simpler and fast enough for typical note counts.

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

The `combine` operator re-runs the filter whenever either the notes list or the query changes. This means if a note is added while a search is active, the filtered results update automatically.

#### Q7: How do you implement sorting by date or priority?

Add a sort option to the ViewModel and combine it with the notes flow. Use an enum for sort types and apply the appropriate comparator.

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

You could also do sorting in the Room query with `ORDER BY`, but handling it in the ViewModel makes it easier to combine with search filtering without writing multiple DAO queries.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How do you structure clean architecture for a notes app?

Even for a small app, separating data, domain, and presentation layers makes the code testable and organized. The domain layer is thin here — mostly the model and a repository interface.

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

Use cases are optional for a notes app. If the only thing a use case does is call one repository method, it's unnecessary indirection. Add them only when the operation involves combining multiple repositories or applying business rules.

#### Q9: How do you set up Hilt for dependency injection?

Create a module that provides the Room database, DAO, and repository. Annotate the ViewModel with `@HiltViewModel` and inject the repository through the constructor.

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

Use `@Binds` for interface-to-implementation bindings — it's more efficient than `@Provides` because it doesn't create a wrapper method. The ViewModel gets the repository automatically through `@Inject constructor`.

#### Q10: How do you handle offline-first architecture in a notes app?

A notes app is inherently offline-first since Room is the primary data store. The key design decision is whether to add cloud sync. If sync is required, treat Room as the source of truth and sync changes to the server in the background.

The pattern is: write to Room immediately, queue the sync operation with WorkManager, and handle conflicts when the sync response comes back. The user never waits for a network call to save a note. This makes the app feel fast and reliable regardless of connectivity.

If cloud sync isn't in scope, the offline-first architecture is just Room with `Flow` — the simplest form. Mention that you'd add WorkManager-based sync if the requirements called for it.

#### Q11: How do you support dark mode?

Use Material 3 dynamic theming. Define a theme that switches between light and dark color schemes based on the system setting. Don't hardcode any colors in composables.

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

Use `MaterialTheme.colorScheme.surface`, `onSurface`, `primary`, etc. in all composables instead of hardcoded `Color.White` or `Color.Black`. If you want user-controlled dark mode (not just system), store the preference in DataStore and provide it to the theme composable.

#### Q12: How do you unit test the ViewModel with StateFlow?

Create a fake repository, pass it to the ViewModel, and use Turbine to collect and assert on the StateFlow emissions.

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

The fake repository uses a `MutableStateFlow<List<Note>>` internally so it behaves like the real one. This is simpler and more reliable than mocking Room's `Flow` return type.

#### Q13: How do you write UI tests for the notes app?

Use `ComposeTestRule` to render composables and interact with them. Test the core flows: adding a note, seeing it in the list, editing it, and deleting it.

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

Use `testTag` for input fields since they don't always have visible text to match on. Keep UI tests focused on user-visible behavior, not implementation details.

#### Q14: Why is the to-do app a good test of fundamentals?

It strips away the complexity of networking and forces you to demonstrate core skills. There's no external API to hide behind — your Room setup, state management, navigation, and UI code are all exposed. Evaluators can see how you handle CRUD operations, form validation, state persistence across configuration changes, and error cases like empty lists or invalid input.

It also reveals coding habits. Do you add a FAB for creating notes or hide the action in a menu? Do you handle the back press during editing? Do you confirm before deleting? These UX details aren't in the requirements, but they show product thinking.

#### Q15: How do you handle the back press when the user is editing a note with unsaved changes?

Track whether the form has been modified and intercept the back navigation. Show a confirmation dialog if there are unsaved changes.

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

This is a detail most candidates skip. It shows you think about the full user experience, not just the happy path.

### Common Follow-ups

- How would you add categories or tags to notes?
- How do you handle Room database migrations when adding a new column?
- How would you implement a rich text editor for note content?
- What's the difference between `OnConflictStrategy.REPLACE` and `ABORT` in Room?
- How would you sync notes across devices using a backend?
- How do you test Room database operations directly?
- How would you implement a pinned notes feature that keeps certain notes at the top of the list?
