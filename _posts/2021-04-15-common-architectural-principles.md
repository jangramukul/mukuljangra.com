---
title: Common Architectural Principles Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Best Practices
---
As Android apps grow in size, it's important to design architecture that allows the app to scale, increases the app's robustness, and makes the app easier to test. Here are some design principles we can follow to design our app:

### Separation of logic
It's a common mistake to write all your code inside an activity or fragment. We should try to separate some code into other classes to make them reusable and readable. But it doesn't mean we must put all the code into other classes. While separating the code, you should be very careful while passing context, proper registering or unregistering callbacks, and avoid separating activity/fragment-specific APIs-related code. And also, try to use Kotlin design patterns like Factory, Builder, etc. If you are thinking about Singleton pattern, yes, you can use this as well. But it comes with the cost of complex testing, thread safety, etc.

### UI and data models
This is one of the most important designs we should follow. From a clean perspective, we should separate the network and local data models and keep it like one for network and another one for local. This saves you from the overburden of unnecessary data you will present in your UI. Rather than sharing data models direct to UI from ViewModel, we should try to share only that state which holds only UI-specific data with the initial value. In general, we put validation in activity, fragment, and viewmodel, But in reality, This is very bad practise. To solve this, we should make a validation helper or usecase class that will validate the inputs. Also, we should try to do mapping only in a repository, not in viewmodel or activity/fragment.

### Single source of truth
When a new data type is defined in your app, you should assign a Single Source of Truth (SSOT) to it. The SSOT is the owner of that data, and only the SSOT can modify or mutate it. To achieve this, the SSOT exposes the data using an immutable type, and to modify the data, the SSOT exposes functions or receives events that other types can call. Generally, in apps, we've database and network sources of data. To implement the SSOT, we fetch the network data and insert it into a database that is not directly accessible to UI. To access the data, UI will use only the database.

### Exposing data
While defining a new data type, you should not expose network data directly to UI. While making an API call, you should only expose the UI state or UI-related data model to the Presentation layer. By adding immutability, it makes UI only focus on a single role — reading and displaying the data. As a result, you should never modify the UI state in the UI directly unless the UI itself is the sole source of its data. The most common mistake we make is by sharing mutable data to UI or passing data from UI to ViewModel directly via params. 