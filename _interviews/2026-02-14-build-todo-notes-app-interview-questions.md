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

There's nowhere to hide with a notes app. No external API, no fancy networking layer, no "well, the server was flaky." It's just you, Room, state management, and CRUD. Think of it like a driving test in an empty parking lot -- every turn, every stop, every mirror check is fully visible.

#### How do you set up Room for a notes app?

Three pieces: an entity (the data), a DAO (the operations), and a database class (the factory). Room reads your annotations at compile time and generates all the SQLite boilerplate you'd otherwise write by hand. It's like hiring a contractor who reads your blueprints and builds the house -- you design, Room constructs.

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

Notice the list query returns `Flow<List<NoteEntity>>` while individual operations are suspend functions. That's intentional -- the list is an ongoing stream (you always want the latest), but insert and delete are one-shot fire-and-forget calls.

#### How do you display notes in a LazyColumn?

Collect the `Flow` from the DAO in the ViewModel, expose it as `StateFlow`, and feed each note into a `LazyColumn` as a card.

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

That `key = { it.id }` is doing more work than it looks. Without it, Compose tracks items by position -- like numbering seats in a theater instead of naming them. Delete seat 3 and suddenly everyone after it shifts. With stable keys, Compose knows exactly which item changed, so swipe-to-delete and reordering just work.

#### How do you implement swipe-to-delete?

`SwipeToDismissBox` from Material 3 wraps each list item and handles the gesture for you. On dismiss, I delete the note and show a Snackbar with undo.

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

`EndToStart` means right-to-left, which is the standard delete direction on Android. The `confirmValueChange` lambda is your gatekeeper -- it decides whether to actually accept the swipe or bounce the item back.

> **🧠 Think about it:** If you delete a note and the user immediately regrets it, what's the cheapest way to undo that without calling Room again? Think about it before reading the next answer.

#### How do you implement undo delete with a Snackbar?

Hold onto the deleted note in memory. If the user taps "Undo," re-insert it. If the Snackbar dismisses on its own, the delete sticks. It's like putting a letter in the "to shred" pile -- you can grab it back before the shredder runs, but once it's gone, it's gone.

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

Here's the thing -- the ViewModel doesn't know Snackbars exist. It just exposes `deleteNote()` and `undoDelete()`. The composable uses `SnackbarHostState` to handle the UI side. Clean separation.

#### How do you build the add/edit note screen with form validation?

One screen handles both add and edit. If a note ID comes through navigation, I load the existing note. No ID? Fresh note. I validate that the title isn't blank before saving -- because a note with no title is like a book with no cover.

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

`save()` returns a boolean so the UI knows whether to navigate back or stay put. I clear `titleError` the moment the user types again -- immediate feedback, no waiting for another save attempt.

#### How do you implement search and filter for notes?

I combine the search query with the notes flow using `combine`. Think of it like two knobs on a radio -- turn either one and the output changes. One knob is the database (notes added or deleted), the other is the search text.

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

Since everything is local, client-side filtering is fast enough for typical note counts. If a note is added while a search is active, the results update automatically -- `combine` re-runs whenever either input changes. I could use Room's `LIKE` query instead, but client-side is simpler and avoids writing extra DAO methods.

#### How do you implement sorting by date or priority?

Same `combine` pattern as filtering. I add a sort option as a `StateFlow` and pair it with the notes flow. An enum keeps the sort types clean.

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

I could sort in the Room query with `ORDER BY`, but doing it in the ViewModel makes it trivial to combine with search filtering without writing multiple DAO methods for every sort-filter combination.

#### How do you structure clean architecture for a notes app?

Even for a small app, I separate data, domain, and presentation. The domain layer is intentionally thin -- just the model and a repository interface. Think of it as a contract: "I don't care how you store notes, just give me these operations."

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

Use cases are optional here. If a use case just calls one repository method, it's a passthrough that adds nothing but an extra file. I'd add them only when combining multiple repositories or applying real business rules.

> **🧠 Think about it:** If someone asked you to swap Room for DataStore or even a remote API, how many files would you need to change with this architecture? That's the whole point of the interface boundary.

#### How do you set up Hilt for dependency injection?

One module provides the Room database and DAO, another binds the repository interface to its implementation. The ViewModel gets `@HiltViewModel` and the repository shows up in its constructor like magic -- except it's not magic, it's a generated component graph.

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

I use `@Binds` instead of `@Provides` for the interface-to-implementation binding. `@Binds` is more efficient because Dagger doesn't generate a wrapper method -- it just wires the implementation directly.

#### How do you handle offline-first architecture in a notes app?

A notes app is offline-first by default -- Room is the primary data store. There's no network call to fail. The real question is whether to add cloud sync on top.

If sync is needed, I treat Room as the source of truth and sync in the background. The pattern: write to Room immediately, queue the sync with WorkManager, handle conflicts when the response comes back. The user never waits for a network call. It's like writing in your notebook first and photocopying it to the office later -- you never lose your notes even if the copier breaks. If cloud sync isn't in scope, the architecture is just Room with `Flow`, which is the simplest form of offline-first.

#### How do you support dark mode?

Material 3 theming handles this cleanly. I define a theme composable that picks between light and dark color schemes based on the system setting.

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

The key rule: use `MaterialTheme.colorScheme.surface`, `onSurface`, `primary`, etc. everywhere instead of hardcoded colors. Hardcode a color once and you've got a component that looks broken in dark mode forever. For user-controlled dark mode beyond the system setting, I store the preference in DataStore and pass it to the theme composable.

#### How do you unit test the ViewModel?

Create a fake repository, hand it to the ViewModel, and assert on the `StateFlow` emissions. No mocking frameworks, no Robolectric -- just plain Kotlin.

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

The fake repository uses a `MutableStateFlow<List<Note>>` internally so it behaves like the real one. This is way simpler than trying to mock Room's `Flow` return type, and the tests actually tell you something useful when they fail.

#### How do you write UI tests for the notes app?

I use `ComposeTestRule` to render composables and drive them through real user interactions -- tap the FAB, type a title, hit save, check the list.

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

I use `testTag` for input fields since they don't always have visible text to match on. The important thing: UI tests should mirror what a real user does -- tap, type, scroll, assert what's visible. Don't test internal state from here.

#### Why is the to-do app a good test of fundamentals?

Because there's nowhere to hide. No networking layer to blame, no complex business logic to get lost in. It's a direct window into how you handle Room setup, state management, navigation, and UI polish. The evaluator sees everything -- your CRUD operations, your form validation, how you persist state across config changes, how you handle an empty list.

But here's what really separates candidates: product thinking. Do I add a FAB or bury the action in a menu? Do I handle back press during editing? Do I confirm before deleting? None of this is in the requirements, but it shows whether I think about the full user experience or just the happy path.

> **🧠 Think about it:** What happens in your notes app if the user rotates the device while typing a new note? If you haven't thought about that, the interviewer definitely will.

#### How do you handle the back press when editing a note with unsaved changes?

I track whether the form has been modified and intercept back navigation with `BackHandler`. If there are unsaved changes, I show a confirmation dialog instead of silently discarding their work.

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

Most candidates skip this entirely. It's a small detail, but it's the kind of detail that tells an interviewer you actually build apps that real people use.

### Common Follow-ups

- How would you add categories or tags to notes?
- How do you handle Room database migrations when adding a new column?
- How would you implement a rich text editor for note content?
- What's the difference between `OnConflictStrategy.REPLACE` and `ABORT` in Room?
- How would you sync notes across devices using a backend?
- How do you test Room database operations directly?
- How would you implement a pinned notes feature that keeps certain notes at the top of the list?
