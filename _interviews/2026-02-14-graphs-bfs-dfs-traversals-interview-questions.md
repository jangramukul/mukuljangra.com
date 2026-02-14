---
title: "Graphs — BFS, DFS & Traversals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 6
---

## Graphs — BFS, DFS & Traversals — What Interviewers Really Ask

Graph problems are among the most common in coding interviews. BFS and DFS form the foundation — once you understand traversal patterns, problems like number of islands, course schedule, and word ladder become variations of the same core ideas.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three main ways to represent a graph?

- **Adjacency List** — Each node stores a list of its neighbors. Most common in interviews. Uses O(V + E) space and makes neighbor iteration fast
- **Adjacency Matrix** — A 2D array where `matrix[i][j] = 1` means there's an edge from i to j. Uses O(V²) space. Good for dense graphs or when you need O(1) edge lookup
- **Edge List** — A list of pairs (or triples for weighted graphs) representing edges. Uses O(E) space. Useful for algorithms like Kruskal's that process edges directly

```kotlin
// Adjacency list — most interview-friendly
val graph = HashMap<Int, MutableList<Int>>()
fun addEdge(u: Int, v: Int) {
    graph.getOrPut(u) { mutableListOf() }.add(v)
    graph.getOrPut(v) { mutableListOf() }.add(u) // undirected
}
```

For most interview problems, build an adjacency list from the input. It's the most space-efficient for sparse graphs and gives you direct access to neighbors.

#### Q2: How does BFS work and when do you use it?

BFS explores nodes level by level using a queue. Start from a source node, visit all its neighbors, then visit all their unvisited neighbors, and so on. BFS guarantees the shortest path in an unweighted graph because it visits nodes in order of their distance from the source.

```kotlin
fun bfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf(start)
    val queue: Queue<Int> = LinkedList()
    queue.add(start)
    val order = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) {
                visited.add(neighbor)
                queue.add(neighbor)
            }
        }
    }
    return order
}
```

Time: O(V + E). Space: O(V) for the visited set and queue. Use BFS when you need shortest path in unweighted graphs, level-order traversal, or need to explore nodes closest to the source first.

#### Q3: How does DFS work and when do you use it?

DFS goes as deep as possible along each branch before backtracking. It uses a stack (or recursion, which uses the call stack). DFS is the go-to for problems involving path finding, cycle detection, connected components, and topological sort.

```kotlin
fun dfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf<Int>()
    val order = mutableListOf<Int>()
    fun explore(node: Int) {
        visited.add(node)
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) explore(neighbor)
        }
    }
    explore(start)
    return order
}
```

Time: O(V + E). Space: O(V) for the visited set plus O(V) for the recursion stack in the worst case (a graph that forms a single chain).

#### Q4: What is the difference between BFS and DFS? When would you pick one over the other?

BFS finds the shortest path in unweighted graphs — DFS does not. BFS uses more memory because it stores an entire level in the queue, while DFS only stores the current path on the stack.

Use BFS for shortest path, level-order problems, and when the answer is likely close to the source. Use DFS for topological sort, cycle detection, connected components, path existence, and problems that need exploring all possibilities (backtracking).

#### Q5: How do you find the number of connected components in an undirected graph?

Iterate through all nodes. For each unvisited node, run BFS or DFS to mark all reachable nodes as visited. Each time you start a new traversal, that's a new connected component.

```kotlin
fun countComponents(n: Int, edges: Array<IntArray>): Int {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        graph.getOrPut(v) { mutableListOf() }.add(u)
    }
    val visited = BooleanArray(n)
    var count = 0
    for (i in 0 until n) {
        if (!visited[i]) {
            count++
            val queue: Queue<Int> = LinkedList()
            queue.add(i)
            visited[i] = true
            while (queue.isNotEmpty()) {
                val node = queue.poll()
                for (neighbor in graph[node].orEmpty()) {
                    if (!visited[neighbor]) {
                        visited[neighbor] = true
                        queue.add(neighbor)
                    }
                }
            }
        }
    }
    return count
}
```

Time: O(V + E). Space: O(V + E).

#### Q6: How do you solve the Number of Islands problem?

Treat the grid as a graph where each '1' cell is a node connected to its four neighbors. Iterate through the grid — when you find a '1', increment the count and run DFS/BFS to mark all connected '1' cells as visited (flip them to '0').

```kotlin
fun numIslands(grid: Array<CharArray>): Int {
    val rows = grid.size
    val cols = grid[0].size
    var count = 0

    fun dfs(r: Int, c: Int) {
        if (r !in 0 until rows || c !in 0 until cols || grid[r][c] == '0') return
        grid[r][c] = '0'
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1)
    }

    for (r in 0 until rows) for (c in 0 until cols) {
        if (grid[r][c] == '1') { count++; dfs(r, c) }
    }
    return count
}
```

Time: O(m * n). Space: O(m * n) worst case for the recursion stack on a grid full of '1's. The BFS approach avoids deep recursion by using a queue instead.

#### Q7: How do you clone a graph?

Use a HashMap to map each original node to its clone. Start DFS or BFS from any node — when you visit a node, create its clone if it doesn't exist. Then for each neighbor, clone it (if needed) and add it to the current clone's neighbor list.

```kotlin
class GraphNode(var value: Int, var neighbors: MutableList<GraphNode> = mutableListOf())

fun cloneGraph(node: GraphNode?): GraphNode? {
    if (node == null) return null
    val clones = HashMap<GraphNode, GraphNode>()

    fun dfs(original: GraphNode): GraphNode {
        clones[original]?.let { return it }
        val copy = GraphNode(original.value)
        clones[original] = copy
        for (neighbor in original.neighbors) {
            copy.neighbors.add(dfs(neighbor))
        }
        return copy
    }
    return dfs(node)
}
```

Time: O(V + E). Space: O(V) for the HashMap plus recursion stack. The HashMap is essential — without it, you'd loop forever on cycles.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What is topological sort and when is it used?

Topological sort produces a linear ordering of vertices in a directed acyclic graph (DAG) such that for every edge u → v, u comes before v. It's used for dependency resolution — build systems, course prerequisites, task scheduling. A topological ordering only exists if the graph has no cycles.

#### Q9: How do you implement topological sort using Kahn's algorithm (BFS-based)?

Kahn's algorithm uses in-degree counting. Start by adding all nodes with in-degree 0 to a queue. Process each node by removing it from the queue, adding it to the result, and decrementing the in-degree of its neighbors. When a neighbor's in-degree hits 0, add it to the queue.

```kotlin
fun topologicalSort(n: Int, edges: List<IntArray>): List<Int> {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(n)
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        inDegree[v]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until n) if (inDegree[i] == 0) queue.add(i)
    val result = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        result.add(node)
        for (neighbor in graph[node].orEmpty()) {
            inDegree[neighbor]--
            if (inDegree[neighbor] == 0) queue.add(neighbor)
        }
    }
    return if (result.size == n) result else emptyList() // empty = cycle exists
}
```

Time: O(V + E). If the result has fewer than V nodes, the graph has a cycle and no valid topological order exists.

#### Q10: How do you implement topological sort using DFS?

Run DFS from each unvisited node. After visiting all neighbors of a node (post-order), push it onto a stack. The stack gives you the topological order when popped. This works because a node is added only after all its dependencies have been processed.

```kotlin
fun topologicalSortDFS(n: Int, edges: List<IntArray>): List<Int> {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) graph.getOrPut(u) { mutableListOf() }.add(v)
    val visited = BooleanArray(n)
    val stack = ArrayDeque<Int>()

    fun dfs(node: Int) {
        visited[node] = true
        for (neighbor in graph[node].orEmpty()) {
            if (!visited[neighbor]) dfs(neighbor)
        }
        stack.addFirst(node) // post-order
    }

    for (i in 0 until n) if (!visited[i]) dfs(i)
    return stack.toList()
}
```

Time: O(V + E). The DFS approach doesn't detect cycles by default — you need to track nodes in the current recursion path (using a "visiting" state) to detect back edges.

#### Q11: How do you detect a cycle in a directed graph?

Use DFS with three states for each node: unvisited, visiting (in the current DFS path), and visited (fully processed). If you encounter a node that's in the "visiting" state, you've found a back edge — that's a cycle.

```kotlin
fun hasCycleDirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) graph.getOrPut(u) { mutableListOf() }.add(v)
    val state = IntArray(n) // 0=unvisited, 1=visiting, 2=visited

    fun dfs(node: Int): Boolean {
        state[node] = 1
        for (neighbor in graph[node].orEmpty()) {
            if (state[neighbor] == 1) return true // back edge = cycle
            if (state[neighbor] == 0 && dfs(neighbor)) return true
        }
        state[node] = 2
        return false
    }

    for (i in 0 until n) if (state[i] == 0 && dfs(i)) return true
    return false
}
```

Time: O(V + E). You can also detect cycles with Kahn's algorithm — if the topological sort result has fewer than V nodes, a cycle exists.

#### Q12: How do you detect a cycle in an undirected graph?

For undirected graphs, a cycle exists if DFS encounters a visited node that isn't the parent of the current node. You need to track the parent to avoid falsely detecting the edge you just came from as a cycle.

```kotlin
fun hasCycleUndirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        graph.getOrPut(v) { mutableListOf() }.add(u)
    }
    val visited = BooleanArray(n)

    fun dfs(node: Int, parent: Int): Boolean {
        visited[node] = true
        for (neighbor in graph[node].orEmpty()) {
            if (!visited[neighbor]) {
                if (dfs(neighbor, node)) return true
            } else if (neighbor != parent) return true
        }
        return false
    }

    for (i in 0 until n) if (!visited[i] && dfs(i, -1)) return true
    return false
}
```

Time: O(V + E). Union-Find is another common approach for undirected cycle detection — if adding an edge connects two nodes already in the same set, there's a cycle.

#### Q13: How do you solve the Course Schedule problem?

Course Schedule is a direct application of cycle detection in a directed graph. Courses are nodes, prerequisites are directed edges. If there's a cycle, you can't complete all courses. Use either Kahn's algorithm (check if topological sort includes all courses) or DFS cycle detection.

```kotlin
fun canFinish(numCourses: Int, prerequisites: Array<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(numCourses)
    for ((course, prereq) in prerequisites) {
        graph.getOrPut(prereq) { mutableListOf() }.add(course)
        inDegree[course]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until numCourses) if (inDegree[i] == 0) queue.add(i)
    var completed = 0
    while (queue.isNotEmpty()) {
        val course = queue.poll()
        completed++
        for (next in graph[course].orEmpty()) {
            inDegree[next]--
            if (inDegree[next] == 0) queue.add(next)
        }
    }
    return completed == numCourses
}
```

Time: O(V + E). Course Schedule II asks for the actual order — just collect the nodes as you process them from the queue.

#### Q14: How do you solve the Word Ladder problem?

Word Ladder is a BFS shortest-path problem. Each word is a node, and two words are connected if they differ by exactly one character. Start BFS from the begin word and stop when you reach the end word. The BFS level gives you the transformation length.

```kotlin
fun ladderLength(beginWord: String, endWord: String, wordList: List<String>): Int {
    val wordSet = wordList.toMutableSet()
    if (endWord !in wordSet) return 0
    val queue: Queue<String> = LinkedList()
    queue.add(beginWord)
    var steps = 1
    while (queue.isNotEmpty()) {
        repeat(queue.size) {
            val word = queue.poll()
            if (word == endWord) return steps
            val chars = word.toCharArray()
            for (i in chars.indices) {
                val original = chars[i]
                for (c in 'a'..'z') {
                    chars[i] = c
                    val newWord = String(chars)
                    if (newWord in wordSet) {
                        queue.add(newWord)
                        wordSet.remove(newWord)
                    }
                }
                chars[i] = original
            }
        }
        steps++
    }
    return 0
}
```

Time: O(n * m * 26) where n is the number of words and m is the word length. Removing words from the set as you add them to the queue avoids revisiting — this is the "visited" check.

#### Q15: How do you check if a graph is bipartite?

A graph is bipartite if you can color every node with one of two colors such that no two adjacent nodes share the same color. Use BFS or DFS — assign a color to the start node, then assign the opposite color to all its neighbors. If you ever find a neighbor with the same color as the current node, the graph is not bipartite.

```kotlin
fun isBipartite(graph: Array<IntArray>): Boolean {
    val n = graph.size
    val color = IntArray(n) { -1 } // -1 = uncolored
    for (i in 0 until n) {
        if (color[i] != -1) continue
        val queue: Queue<Int> = LinkedList()
        queue.add(i)
        color[i] = 0
        while (queue.isNotEmpty()) {
            val node = queue.poll()
            for (neighbor in graph[node]) {
                if (color[neighbor] == -1) {
                    color[neighbor] = 1 - color[node]
                    queue.add(neighbor)
                } else if (color[neighbor] == color[node]) {
                    return false
                }
            }
        }
    }
    return true
}
```

Time: O(V + E). A graph is bipartite if and only if it contains no odd-length cycles. This check is also used to determine if a graph can be 2-colored, which comes up in scheduling and assignment problems.

### Common Follow-ups

- What's the difference between BFS and Dijkstra's algorithm?
- How would you find the shortest path in a graph with edge weights of 0 and 1? (0-1 BFS with deque)
- How do you find all paths between two nodes in a directed graph?
- Can you detect a cycle using BFS in a directed graph?
- How does bidirectional BFS work and when would you use it for Word Ladder?
- What is the difference between Kahn's algorithm and DFS-based topological sort in terms of use cases?
- How would you find the shortest cycle in an undirected graph?
- What is the time complexity of topological sort on a graph with V vertices and E edges?
