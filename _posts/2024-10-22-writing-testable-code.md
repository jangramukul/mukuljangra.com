---
title: How To Write Testable Code?
layout: post
categories: post
tags:
  - Kotlin
  - Android
  - Testing
---

In the early days of development, I had no idea about testing. I kept avoiding testable code and ended up with multiple production bugs and issues. After realising the importance of writing clean and testable code, I started to explore multiple solutions and testing frameworks for creating an easily testable environment. Apart from frameworks and libraries, there are some principles that make testing easier. Most of the testable code issues, like code coverage issues, can be tackled using these principles.

## 1. Use Interfaces

Using an interface for testing is one of the basic requirements. An interface is an empty shell for implementation requirements. A concrete implementation using an interface is used for achieving easy mocks. In the codebase, any class having implementation requirements like a repository, data source, API, etc., can be encapsulated using interface methods. It's a good practice to have an interface over an implementation class for creating a good testing environment. During testing, you can easily create mocks for `LoginRepository` without unnecessary exposing the actual implementation.

```kotlin
// interface
interface LoginRepository {
    fun signIn(authId: String): String
}

// concrete implementation class
class LoginRepositoryImpl: LoginRepository {
   overide fun signIn(authId: String): String {
      // implementation logic
   }
}
```


## 2. Avoid Frameworks and Library Access

Using framework or library classes or functions in your code makes testing harder because it's difficult to mock the internal classes. Testable code must avoid direct access to classes of frameworks or libraries. Most of the time, the Factory design pattern is used for creating objects. This object can be a concrete implementation or a simple plain class, depending on implementation requirements. Using the factory pattern is one of the most useful patterns when accessing frameworks or libraries in testable code. Let's see an example:

```kotlin
// SearchClient
interface SearchClient {
     fun getResults(query: String): List<String>
}

// SearchClient requires activity or fragment level context because
// client dispose the results when activity or fragment destroy.
class SearchClientImp(private val context: Context): SearchClient {
     overide fun getResults(query: String): List<String> {
        // return results
     }
}

// Repository
interface SearchRepository {
     fun search(client: SearchClient, query: String): List<String>
}

class SearchRepositoryImpl: SearchRepository {
     overide fun search(client: SearchClient, query: String): List<String> {
       return client.getResults(query = query)
   }
} 

// Factory
interface SearchClientFactory {
     fun create(context: Context): SearchClient
}

//Factory Implementation
class SearchClientFactoryImpl: SearchClientFactory {
    overide fun create(context: Context): SearchClient {
       return SearchClientImpl()
   }
}

//ViewModel or Presenter
class SearchViewModel(private val respository: SearchRepository): ViewModel() {
   // client must be init from UI because internal search client is attached to context.
   private fun search(client: SearchClient) {
        repository.search(client, query)
   }
}
```

In the code, we are using a factory to create the `SearchClient` object. At the same time, we are not exposing the internal search client SDK to the repository and view model. This is how we avoid the direct usage of framework or library classes. Also, if you have paid attention to the code, our internal search client SDK is attached to the fragment or activity lifecycle, which requires a context. We are taking `SearchClient` as an argument to the search function in `SearchViewModel` to avoid exposing the context or framework-level access. During the testing of `SearchViewModel`, you can easily mock the `SearchClient` without providing the context or internal SDK classes.

## 3. Use Dependency Injection

Dependency injection is a process of supplying a resource or object to a given piece of code. Dependency injection is a powerful code pattern that helps to achieve good and testable code. Let's see an example:

```kotlin
interface LoginRepository {
    fun signIn(authId: String): String
}

// Concrete Implementation
class LoginRepositoryImpl(
   private val networkSource: LoginNetworkDataSource
): LoginRepository {
    overide fun signIn(authId: String): String {
        //networkSource.signIn(...)
    }
}

// ViewModel
class LoginViewModel(private val repository: LoginRepository): ViewModel() {
     fun signIn() {
        //repository.signIn(....)
     }
}

//DI Module
object DependencyGraph {
    val viewModel = LoginViewModel(repository = ...)
}

//Testing
class LoginViewModelTest {

   @Mock
   private val repository = mock<LoginRepository>()
   private val sut = LoginViewModel(repository = repository)

   @Test
   fun given_valid_auth_id_when_sign_in_then_returns_success() {
       //....
   }
}
```

Here, we are using the singleton pattern for DI (Dependency Injection) for demonstration purposes. However, you could use Hilt or Koin frameworks for DI. There is one thing that needs to be emphasized: when providing the dependency of `LoginRepositoryImpl`, we are only providing the interface for testing purposes, as you can see in the `LoginViewModelTest` class. In `LoginViewModelTest`, we are mocking the `LoginRepository` interface, not the actual concrete implementation, which makes testing easier.

## 4. Use Tiny Functions

In clean architecture, tiny functions are the most important part of writing clean and testable code. Technically, writing tiny functions requires a whole mindset of its own. Sometimes, it begins with writing a function and then restructuring it into multiple tiny functions. This process is similar to breaking down a giant piece of logic into multiple tiny functions, and you can break the functions as needed along the way.

Most of the time, I start writing functions from the bottom. For instance, when you're writing a function for signing in with different internal logic, these different internal logics could be split into tiny functions. Each function invokes a single logic or responsibility.

Writing these tiny functions in a Companion object for more isolation and testable code. Each tiny function serves a single responsibility. During testing, you can easily invoke the Companion object functions to test the logic and responsibility. Let's see an example:

```kotlin
class LoginRepositoryImpl(
   private val network: LoginNetworkSource
): LoginRepository {

  overide fun signIn(authId: String): String {
     return signIn(network = network, authId = authId)
  }

  Companion object {
     private fun signIn(network: LoginNetworkSource, authId: String): String {
        val result = network.signIn(authId)
        if (result.isSuccess()) {
            submitAuthToken(result.token)
            submitAuthSession(result.authId)
         } else {
            invalidateAuthSession(authId)
        }
    }

    private fun submitAuthToken(token: String) {
         //logic...
    }

    private fun submitAuthSession(authId: String) {
         //logic...
    }

    private fun invalidateAuthSession(authId: String) {
        //logic...
    }
  }
}
```

And here we are done! 
Thanks for reading! 





