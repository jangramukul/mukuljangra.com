---
title: Clean and Scalable Architecture Guide
layout: post
categories: post

tags:
  - Android
  - Architecture

---
There has always been an open debate on which architecture we should choose and why we need architecture, blah, blah, blah. In Android development, people are always confused when choosing MVVM, MVP.

But yeah! Most people choose MVVM because of the model-view-view-model relation. But in reality, choosing any of them is not mandatory. You can try out the architecture that suits your needs. Here, we will target an architecture design that suits large projects and uses the full power of development. In the end, you will find the architecture you were following was not as good as your own. So, let’s open the secrets of architecture.

Lots of people think we should write clean code. Of course, we should. But if we don’t understand clean code principles, it will become a serious problem/bug. Because while writing clean code, we only consider minimizing the code by putting some code into a separate class.

If you’re an Android developer, you should be careful while putting code into separate classes. Because it comes with the cost of thread safety, memory leaks, parallel execution issues, etc. Also, in Android, most things use context. It’s a bad practise to pass the context to another class.

#### Clean Architecture and Modularization
Clean architecture solves the complexity of projects in a simpler and scalable form. In clean architecture, we separate the codebase of an app into different layers at different levels/scopes. By using SOLID principles, we can make it more beautiful and scalable. SOLID principles are design principles that include questions like

- Is the component scalable?
- How is DI managed?
- What patterns are used for the prevention of complexity?
- How common components are sharing code, and in which manner?

Modularization is a technique where we separate the layers/features into modules. By using multi-module architecture, complex projects can easily be converted into more readable, testable, reusable, and scalable forms. And improve the Gradle build performance.

Both clean architecture and modularization help the new team members to understand the flow of code easily. It makes adopting processes smooth and easy.

#### Common Architectural Principles
As Android apps grow in size, it’s important to design architecture that allows the app to scale, increases the app’s robustness, and makes the app easier to test. Here are some design principles we can follow to design our app:

##### Separation of logic
It’s a common mistake to write all your code inside an activity or fragment. We should try to separate some code into other classes to make them reusable and readable. But it doesn’t mean we must put all the code into other classes. While separating the code, you should be very careful while passing context, proper registering or unregistering callbacks, and avoid separating activity/fragment-specific APIs-related code. And also, try to use Kotlin design patterns like Factory, Builder, etc. If you are thinking about Singleton pattern, yes, you can use this as well. But it comes with the cost of complex testing, thread safety, etc.

##### UI and data models
This is one of the most important designs we should follow. From a clean perspective, we should separate the network and local data models and keep it like one for network and another one for local. This saves you from the overburden of unnecessary data you will present in your UI. Rather than sharing data models direct to UI from ViewModel, we should try to share only that state which holds only UI-specific data with the initial value. In general, we put validation in activity, fragment, and viewmodel, But in reality, This is very bad practise. To solve this, we should make a validation helper or usecase class that will validate the inputs. Also, we should try to do mapping only in a repository, not in viewmodel or activity/fragment.

##### Single source of truth
When a new data type is defined in your app, you should assign a Single Source of Truth (SSOT) to it. The SSOT is the owner of that data, and only the SSOT can modify or mutate it. To achieve this, the SSOT exposes the data using an immutable type, and to modify the data, the SSOT exposes functions or receives events that other types can call. Generally, in apps, we’ve database and network sources of data. To implement the SSOT, we fetch the network data and insert it into a database that is not directly accessible to UI. To access the data, UI will use only the database.

##### Exposing data
While defining a new data type, you should not expose network data directly to UI. While making an API call, you should only expose the UI state or UI-related data model to the Presentation layer. By adding immutability, it makes UI only focus on a single role — reading and displaying the data. As a result, you should never modify the UI state in the UI directly unless the UI itself is the sole source of its data. The most common mistake we make is by sharing mutable data to UI or passing data from UI to ViewModel directly via params.

#### Layers of Clean Architecture
Before diving into a project structure, let’s first understand the layers of architecture. We generally have three layers: Data, Domain, and Presentation.

##### Data Layer
The data layer is a part of the business logic. It includes local storage or caching, networking, models and mappers, etc. It manages data operations like fetching data from the network or local database. It’s a good practise if we define separate data sources for the network and database. Often, we get into the mess of merging network and database data sources.

Sometimes, we need an in-memory cache to preserve the data. Suppose a new requirement is introduced for the News app: when the user opens the screen, cached news must be presented to the user if a request has been made previously. Otherwise, the app should request a network to fetch the latest news.

You can preserve data while the user is in your app by adding in-memory data caching. Caches are meant to save some information in memory for a specific time — in this case, as long as the user is in the app. Using Mutex from Kotlin Coroutines, we can lock the thread-safe write. Suppose the user navigates away from the screen while the network request is in progress, it’ll be canceled, and the result won’t be cached. In this case, you can make an APIs call inside some external coroutine scope.

##### Domain Layer
The domain layer is responsible for encapsulating the complex business logic. It connects UI and Data layer using a reusable usecase or interactor that can easily reuse by multiple data providers like the viewmodel. Usecase is responsible for single data operations like fetching data from users, inserting data into local databases, validating input types, etc.

##### Presentation Layer
The presentation layer is also known as UI Layer. It is responsible for displaying application data on the screen. In simple words, it deals with the UI part of an application. In Presentation layer, UI triggers the event to viewmodel or other source or vice versa. It’s a bad practise to expose the data directly from viewmodel or another source to UI Layer. Rather than having multiple states or properties for updating the UI, you should consider making a single State Model that holds only required UI Data. The key benefit of this is UI able to focus on only one role of reading the data, not writing or mapping the data.As a result, you should never modify the UI state in the UI directly unless the UI itself is the sole source of its data. Only the source or owner of data should be allowed to update the data, not the UI directly. You should consider the immutability of the UI state because exposing the right to update/write data directly to UI is not a good idea. The key to this principle is that exposing data is only allowed to its owner, not UI.

#### Modularization
In an ever-growing code base, scalability, readability, testability, and overall code quality often decrease over time. This comes as a result of the codebase increasing in size without its maintainers taking active measures to enforce an easily maintainable structure. Modularization is a means of structuring your codebase in a way that improves maintainability and helps avoid these problems.

Modularization is a practise of organizing a code base into loosely coupled and self-contained parts. Each part is a module. Each module is independent and serves a clear purpose. In Modularization, it depends on you to divide your app into different modules by the feature or by the architecture layers. At some points, you might be confused about choosing module separation. You should separate it by features with architecture layers. But each feature module should not depend on other feature modules. You should keep it independent as much as you can. It improves the reusability of modules. Each feature module cannot communicate directly with other feature modules. In fact, the App module has the access to all modules of the app.

Managing database: You might think, can we have multiple databases according to app features? Or should we only hold one database for an app? As a solution to this, you can adopt both approaches. It depends on your app needs. You should not go for the multiple databases approach if your app needs database tables join-related data. If your app doesn’t have to deal with multiple database’s tables joins, you can adopt the multiple databases approach easily.

App navigation: While dealing with app navigation, you should hold a central place where all your navigation screens are combined to make awesome app navigation. You can choose App Module as the central place and easily manage your app navigation into this.
