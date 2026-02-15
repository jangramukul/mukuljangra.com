---
title: Compose State Management Guide
layout: post
sequence: 126
categories: post
tags:
  - Jetpack Compose
  - Android
---

State drives everything in Compose. Without state, you have static text on screen — a layout that renders once and never changes. With state, you get interactive UI that responds to user input, network results, and lifecycle events. But managing state wrong causes one of two problems: either your state disappears when the user rotates the phone (or worse, when the system kills your process), or your composables recompose far more often than they need to.

I've spent enough time debugging both categories to have strong opinions about which state primitive belongs where. The Compose runtime gives you a handful of tools — `mutableStateOf`, `remember`, `rememberSaveable`, observable collections, and the state holder pattern — and the mistake most developers make is treating them as interchangeable. Each has a specific scope, a specific survival guarantee, and a specific cost. Understanding those boundaries is what separates Compose code that works on a demo from Compose code that works in production.

## mutableStateOf

`mutableStateOf` creates an observable state holder. When the value changes, Compose recomposes any composable that reads it. Under the hood, this connects to the [snapshot system](https://mukuljangra.com/2025/03/13/compose-snapshot-system.html) — every read during composition is recorded as a dependency, and every write triggers invalidation of exactly those restart scopes that depend on the changed state object.

```kotlin
@Composable
fun OrderCounter() {
    var itemCount = mutableStateOf(0)

    Column {
        Text("Items: ${itemCount.value}")
        Button(onClick = { itemCount.value++ }) {
            Text("Add Item")
        }
    }
}
```

This code compiles and runs. But the counter never actually works — the value resets to 0 on every recomposition. Every time `OrderCounter` recomposes, a brand new `MutableState` is created with the initial value of 0. The previous instance is garbage collected. The button click increments the value, which triggers recomposition, which creates a fresh `mutableStateOf(0)`, and the cycle repeats. This is the single most common Compose state bug. The fix is `remember`.

## remember

`remember` tells Compose to store a value across recompositions. The lambda runs once during the initial composition, and on subsequent recompositions, Compose returns the previously stored instance.

```kotlin
@Composable
fun OrderCounter() {
    var itemCount by remember { mutableStateOf(0) }

    Column {
        Text("Items: $itemCount")
        Button(onClick = { itemCount++ }) {
            Text("Add Item")
        }
    }
}
```

Now the counter works. The `MutableState` is created once and retained across recompositions. The `by` delegate syntax lets you read and write `itemCount` directly instead of going through `.value`.

But `remember` has a hard boundary: it survives recomposition, but **not** configuration changes and **not** process death. When the user rotates the device, Android destroys and recreates the Activity. The entire composition is disposed and rebuilt from scratch. Every `remember` block runs its lambda again, producing fresh initial values.

For some state, this is perfectly fine. Animation progress, tooltip visibility, whether a dropdown menu is open — this is transient UI state that doesn't need to survive rotation. `remember` is the right tool for state that exists only while the composable is actively on screen and doesn't carry user-meaningful data.

The key parameter on `remember` is underappreciated. You can pass keys that invalidate the cached value:

```kotlin
@Composable
fun ProductDetail(productId: String) {
    // Recomputes when productId changes, survives recomposition otherwise
    val formatter = remember(productId) {
        PriceFormatter(currencyFor(productId))
    }

    Text(formatter.format(product.price))
}
```

This is useful for expensive object creation tied to a specific input. Without the key, you'd keep using a stale `PriceFormatter` after navigating to a different product. With the key, `remember` detects the change and re-runs the lambda.

## rememberSaveable

`rememberSaveable` is `remember` with persistence. It survives recomposition, configuration changes (rotation, dark mode toggle, language change), **and** process death. It serializes the value into the `Bundle` that Android saves and restores through the saved instance state mechanism.

```kotlin
@Composable
fun SearchBar() {
    var query by rememberSaveable { mutableStateOf("") }

    OutlinedTextField(
        value = query,
        onValueChange = { query = it },
        label = { Text("Search products") }
    )
}
```

The user types "wireless headphones," rotates the phone, and the query is still there. The system kills the app in the background, the user returns, and the query is still there. This is state that users **expect** to persist — if they filled in a search field and it vanished on rotation, that's a genuine UX bug.

Use `rememberSaveable` for: form input, selected tabs, scroll position, toggle states the user explicitly set, search queries. The mental model is simple — if the user would notice the state disappearing, it needs `rememberSaveable`.

Out of the box, `rememberSaveable` works with anything that fits in a `Bundle`: primitives, strings, and parcelable objects. For custom types, you have two options.

The first is `@Parcelize`:

```kotlin
@Parcelize
data class ShippingAddress(
    val street: String,
    val city: String,
    val zipCode: String
) : Parcelable

@Composable
fun ShippingForm() {
    var address by rememberSaveable {
        mutableStateOf(ShippingAddress("", "", ""))
    }
    // address survives rotation and process death
}
```

The second is a custom `Saver`, which gives you control over serialization:

```kotlin
data class CartFilter(val category: String, val maxPrice: Int)

val CartFilterSaver = listSaver<CartFilter, Any>(
    save = { listOf(it.category, it.maxPrice) },
    restore = { CartFilter(it[0] as String, it[1] as Int) }
)

@Composable
fun FilterPanel() {
    var filter by rememberSaveable(stateSaver = CartFilterSaver) {
        mutableStateOf(CartFilter("Electronics", 500))
    }
}
```

The tradeoff is size. The saved instance state `Bundle` has a practical limit — Android throws `TransactionTooLargeException` if the total binder transaction exceeds roughly 1 MB. Keep `rememberSaveable` for small, user-meaningful state. Large data belongs in the data layer — Room, DataStore, or the ViewModel's in-memory cache — and should be re-fetched after process death using saved identifiers as restoration keys.

## mutableStateListOf and mutableStateMapOf

Here's a pattern I see constantly in production code:

```kotlin
// Common but problematic approach
var items by remember { mutableStateOf(listOf("Milk", "Eggs")) }

fun addItem(item: String) {
    items = items + item  // creates a new list every time
}
```

This works, but it's wasteful. Every addition creates an entirely new `List` instance and assigns it to the state. For a grocery list with 5 items, nobody notices. For a chat message list with 500 items, the allocations add up.

`mutableStateListOf` solves this by giving you a list that is itself observable. Adding, removing, or modifying elements directly triggers recomposition — no need to create new list instances:

```kotlin
@Composable
fun GroceryList() {
    val items = remember { mutableStateListOf("Milk", "Eggs") }

    LazyColumn {
        items(items, key = { it }) { item ->
            Text(item)
        }
    }

    Button(onClick = { items.add("Bread") }) {
        Text("Add Item")
    }
}
```

The difference is that `mutableStateListOf` integrates with the snapshot system at the collection level. When you call `items.add("Bread")`, the snapshot system records the mutation and invalidates only the composables that read this list. The same principle applies to `mutableStateMapOf` for key-value pairs:

```kotlin
@Composable
fun NotificationSettings() {
    val preferences = remember {
        mutableStateMapOf(
            "order_updates" to true,
            "promotions" to false,
            "price_drops" to true
        )
    }

    preferences.forEach { (key, enabled) ->
        Row {
            Text(key.replace("_", " ").replaceFirstChar { it.uppercase() })
            Switch(
                checked = enabled,
                onCheckedChange = { preferences[key] = it }
            )
        }
    }
}
```

One gotcha: `mutableStateListOf` and `mutableStateMapOf` don't work with `rememberSaveable` out of the box. The collections aren't `Parcelable` and there's no built-in `Saver`. If you need a saveable list, you'll need a custom `Saver` or handle restoration through `SavedStateHandle` in a ViewModel. For most cases, observable collections live in `remember` for transient UI state, and the persistent version lives in the data layer.

## State Holder Pattern

Once a composable accumulates more than two or three pieces of related state, it starts doing too much — reading state, updating state, validating input, and also trying to render UI. The state holder pattern extracts that logic into a plain Kotlin class, keeping the composable focused on what it should do: describe UI.

```kotlin
class CheckoutFormState(
    initialName: String,
    initialEmail: String
) {
    var name by mutableStateOf(initialName)
        private set
    var email by mutableStateOf(initialEmail)
        private set
    var nameError by mutableStateOf<String?>(null)
        private set
    var emailError by mutableStateOf<String?>(null)
        private set

    val isValid: Boolean
        get() = nameError == null && emailError == null
                && name.isNotBlank() && email.isNotBlank()

    fun updateName(value: String) {
        name = value
        nameError = if (value.isBlank()) "Name is required" else null
    }

    fun updateEmail(value: String) {
        email = value
        emailError = when {
            value.isBlank() -> "Email is required"
            !value.contains("@") -> "Invalid email format"
            else -> null
        }
    }
}
```

The `remember` function for creating and retaining the state holder follows a convention — a `rememberXxxState()` function:

```kotlin
@Composable
fun rememberCheckoutFormState(
    initialName: String = "",
    initialEmail: String = ""
): CheckoutFormState {
    return remember {
        CheckoutFormState(initialName, initialEmail)
    }
}

@Composable
fun CheckoutForm(onSubmit: (String, String) -> Unit) {
    val formState = rememberCheckoutFormState()

    Column(modifier = Modifier.padding(16.dp)) {
        OutlinedTextField(
            value = formState.name,
            onValueChange = { formState.updateName(it) },
            label = { Text("Full Name") },
            isError = formState.nameError != null,
            supportingText = {
                formState.nameError?.let { Text(it) }
            }
        )

        OutlinedTextField(
            value = formState.email,
            onValueChange = { formState.updateEmail(it) },
            label = { Text("Email") },
            isError = formState.emailError != null,
            supportingText = {
                formState.emailError?.let { Text(it) }
            }
        )

        Button(
            onClick = { onSubmit(formState.name, formState.email) },
            enabled = formState.isValid
        ) {
            Text("Continue to Payment")
        }
    }
}
```

This is the same pattern Google uses in the Compose toolkit itself. `rememberScrollState()`, `rememberLazyListState()`, `rememberDrawerState()` — they all create a state holder and wrap it in `remember`. The composable calls a `rememberXxxState()` function to get an instance, reads state, and delegates mutations to the state holder's methods. No ViewModel, no coroutines, just a class that owns its logic and a composable that owns its UI.

I think this pattern is underused. Teams jump to ViewModel for everything, even for UI-only logic like form validation or drawer toggle state. The state holder pattern is lighter — no lifecycle dependency, no Hilt wiring, no `SavedStateHandle` ceremony. It's the right abstraction when the state is purely about UI behavior and doesn't need to survive beyond the composable's lifetime.

## When to Use What

This is where most confusion lives, so I'll be direct about the decision tree I follow.
**`remember`** is for transient, composable-scoped state. Expanded/collapsed toggles, animation state, a `FocusRequester`, a `SnackbarHostState`. State that exists only while the composable is on screen, and nobody cares if it resets on rotation.

**`rememberSaveable`** is for user-visible state that should survive configuration changes and process death. Search queries, selected filters, form input, scroll position. If the user typed it, selected it, or scrolled to it, use `rememberSaveable`.

**State holder class with `remember`** is for complex UI logic involving multiple related state fields, validation, or derived computations. Extract the logic into a class, keep the composable focused on rendering.

**ViewModel** is for business logic state that connects to the data layer — repositories, use cases, network calls. ViewModel survives configuration changes by default, and it's scoped to a navigation destination or Activity. Use it when state depends on data from outside the UI layer. Combine it with `rememberSaveable` or `SavedStateHandle` for the full picture — ViewModel handles business logic and data fetching, `SavedStateHandle` handles process death restoration of user inputs.

The mistake I see most often is using `remember` where `rememberSaveable` belongs. A text field backed by `remember { mutableStateOf("") }` works in development — you never rotate, process death never happens on your desk. Then it ships, and users on low-memory devices lose their half-written messages. The fix is one word — `rememberSaveable` — but you have to know the difference.

## Quiz

**1.** You have a composable that shows a tooltip on long press. The tooltip visibility is managed with:

```kotlin
var showTooltip by remember { mutableStateOf(false) }
```

The user long presses, sees the tooltip, then rotates the device. What happens?

**Wrong**: The tooltip stays visible because `remember` survives configuration changes.

**Correct**: The tooltip disappears. `remember` does not survive configuration changes — the Activity is destroyed and recreated, and `showTooltip` resets to `false`. This is fine — tooltip visibility is transient state that doesn't need to persist.

**2.** You build a settings screen where the user toggles notifications on/off. The toggle state uses:

```kotlin
var notificationsEnabled by remember { mutableStateOf(true) }
```

The user disables notifications, then the system kills the app in the background. They return from the task switcher. What state do they see?

**Wrong**: Notifications are disabled because the state was saved.

**Correct**: Notifications show as enabled (the default). `remember` doesn't survive process death. This is a real bug — the user explicitly changed a setting and it reverted. This state should use `rememberSaveable` or, better yet, be persisted to DataStore since it's a preference that should survive app reinstall too.

## Coding Challenge

Build a multi-step registration form with three steps: personal info (name, email), address (street, city, zip code), and confirmation. Use a state holder class to manage all form fields and the current step index. Form input and step index should survive rotation and process death. Add validation: name and email can't be blank, email must contain "@", zip code must be numeric. The "Next" button should be disabled until the current step's fields are valid. The confirmation step shows a read-only summary of all entered data.

This exercise forces you to make real decisions about `remember` vs `rememberSaveable`, where validation logic lives, and how to structure a state holder that manages multiple pages of state.

Thanks for reading!
