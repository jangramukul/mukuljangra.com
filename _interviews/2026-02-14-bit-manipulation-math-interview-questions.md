---
title: "Bit Manipulation & Math"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 12
level: senior
sequence: 60
---

## Bit Manipulation & Math

Bit manipulation shows up in interviews as a way to test your understanding of how numbers work at the binary level. These problems often have elegant O(1) or O(log n) solutions that replace brute-force approaches. Math-based questions — GCD, primes, modular arithmetic — appear less frequently but are expected at the senior level.

### Core Questions

#### Q1: What are the basic bitwise operators and what do they do?

- **AND (`and`)** — Sets a bit to 1 only if both bits are 1. Used for masking specific bits.
- **OR (`or`)** — Sets a bit to 1 if either bit is 1. Used for setting bits.
- **XOR (`xor`)** — Sets a bit to 1 if exactly one bit is 1. Used for toggling bits and finding unique elements.
- **NOT (`inv()`)** — Flips all bits. Turns 0s to 1s and vice versa.
- **Left shift (`shl`)** — Shifts bits left by n positions, filling with zeros. Equivalent to multiplying by 2^n.
- **Right shift (`shr`)** — Shifts bits right by n positions. Equivalent to dividing by 2^n (for positive numbers). Kotlin also has `ushr` for unsigned right shift which fills with zeros regardless of sign.

#### Q2: How do you check if a number is a power of two?

A power of two has exactly one bit set in binary — `1`, `10`, `100`, `1000`, etc. If you subtract 1, all the lower bits flip — `0111`, `0011`, etc. So `n and (n - 1)` clears that single set bit and gives zero. Check `n > 0 && n and (n - 1) == 0`. Time O(1).

```kotlin
fun isPowerOfTwo(n: Int): Boolean {
    return n > 0 && (n and (n - 1)) == 0
}
```

#### Q3: How do you count the number of 1 bits (Hamming weight) in an integer?

Use `n and (n - 1)` which clears the lowest set bit each time. Count how many times you can do this before n becomes zero. Time O(k) where k is the number of set bits.

```kotlin
fun hammingWeight(n: Int): Int {
    var num = n
    var count = 0
    while (num != 0) {
        num = num and (num - 1)
        count++
    }
    return count
}
```

The alternative is checking each of the 32 bits with a loop and right shift, but the `n and (n - 1)` trick skips zero bits entirely.

#### Q4: How does XOR help find a single number in an array where every other number appears twice?

XOR has two useful properties: `a xor a = 0` (same values cancel) and `a xor 0 = a` (identity). XOR all elements together — every duplicate pair cancels out, leaving only the unique number. Time O(n), space O(1).

```kotlin
fun singleNumber(nums: IntArray): Int {
    var result = 0
    for (num in nums) result = result xor num
    return result
}
```

This only works when exactly one number is unique and all others appear exactly twice. For three occurrences, you need a different approach using bit counting.

#### Q5: How do you find the missing number in an array of 0 to n?

XOR all numbers from 0 to n with all elements in the array. The duplicate values cancel out and you're left with the missing one. Time O(n), space O(1).

```kotlin
fun missingNumber(nums: IntArray): Int {
    var xor = nums.size
    for (i in nums.indices) {
        xor = xor xor i xor nums[i]
    }
    return xor
}
```

The math approach works too: `n * (n + 1) / 2 - sum(array)`. But XOR avoids potential integer overflow for large n.

#### Q6: How do you check, set, clear, and toggle a specific bit?

These are the four fundamental bit operations and they come from combining the basic operators with masks.

- **Check bit i**: `(n shr i) and 1` — shift bit i to position 0 and mask with 1.
- **Set bit i**: `n or (1 shl i)` — OR with a mask that has only bit i set.
- **Clear bit i**: `n and (1 shl i).inv()` — AND with a mask that has every bit set except bit i.
- **Toggle bit i**: `n xor (1 shl i)` — XOR flips only bit i.

```kotlin
fun checkBit(n: Int, i: Int): Boolean = (n shr i) and 1 == 1
fun setBit(n: Int, i: Int): Int = n or (1 shl i)
fun clearBit(n: Int, i: Int): Int = n and (1 shl i).inv()
fun toggleBit(n: Int, i: Int): Int = n xor (1 shl i)
```

#### Q7: How do you reverse the bits of a 32-bit integer?

Process each bit from position 0 to 31. Extract the lowest bit of the input with `n and 1`, shift the result left to make room, OR the extracted bit in, then shift the input right. After 32 iterations, the result holds the reversed bits. Time O(1) since it's always 32 iterations.

```kotlin
fun reverseBits(n: Int): Int {
    var input = n
    var result = 0
    for (i in 0 until 32) {
        result = (result shl 1) or (input and 1)
        input = input shr 1
    }
    return result
}
```

#### Q8: How do you count the total number of 1 bits for every number from 0 to n?

The brute force counts bits for each number individually in O(n log n). The DP approach uses the fact that `countBits[i] = countBits[i shr 1] + (i and 1)`. Shifting right removes the lowest bit, and `i and 1` tells you what that bit was. Build the array bottom-up. Time O(n), space O(n).

```kotlin
fun countBits(n: Int): IntArray {
    val result = IntArray(n + 1)
    for (i in 1..n) {
        result[i] = result[i shr 1] + (i and 1)
    }
    return result
}
```

This is a classic DP-on-bits problem. The alternative recurrence `result[i] = result[i and (i - 1)] + 1` works too — it strips the lowest set bit.

### Deep Dive Questions

#### Q9: What is bit masking and how is it used to represent subsets?

A bitmask is an integer where each bit represents whether an element is included in a subset. For a set of n elements, there are 2^n possible subsets, each represented by an n-bit integer. Bit i being 1 means element i is included.

This is used in problems like "find all subsets," "traveling salesman," and state-space DP where you need to track which elements have been used. Iterating all subsets is just looping from 0 to 2^n - 1.

```kotlin
fun generateSubsets(nums: IntArray): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    val n = nums.size
    for (mask in 0 until (1 shl n)) {
        val subset = mutableListOf<Int>()
        for (i in 0 until n) {
            if ((mask shr i) and 1 == 1) subset.add(nums[i])
        }
        result.add(subset)
    }
    return result
}
```

#### Q10: How do you find two non-repeating numbers in an array where every other number appears twice?

XOR all elements to get `xorAll = a xor b` where a and b are the two unique numbers. Since a and b differ, at least one bit in `xorAll` is 1. Find any set bit (use `xorAll and -xorAll` to isolate the lowest one). Split all numbers into two groups based on whether that bit is set. XOR within each group gives a and b separately. Time O(n), space O(1).

```kotlin
fun singleNumbers(nums: IntArray): IntArray {
    var xorAll = 0
    for (num in nums) xorAll = xorAll xor num
    val diffBit = xorAll and (-xorAll)
    var a = 0
    var b = 0
    for (num in nums) {
        if (num and diffBit != 0) a = a xor num
        else b = b xor num
    }
    return intArrayOf(a, b)
}
```

The key insight is that `xorAll and -xorAll` isolates the rightmost set bit. This works because `-xorAll` is the two's complement, which flips all bits and adds 1.

#### Q11: How do you compute GCD using Euclid's algorithm?

The GCD of two numbers a and b is the same as GCD of b and a % b. Keep reducing until b becomes zero — then a holds the GCD. Time O(log(min(a, b))), space O(1) iteratively.

```kotlin
fun gcd(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val temp = y
        y = x % y
        x = temp
    }
    return x
}

fun lcm(a: Int, b: Int): Int = a / gcd(a, b) * b
```

For LCM, use `a * b / gcd(a, b)`. But compute `a / gcd(a, b) * b` instead to avoid overflow. LCM shows up in problems involving synchronization, scheduling, and fraction arithmetic.

#### Q12: How does the Sieve of Eratosthenes work?

Start with a boolean array where every index is marked as prime. Starting from 2, for each prime number, mark all its multiples as not prime. The optimization is to start marking from p^2 because smaller multiples were already handled by earlier primes. Time O(n log log n), space O(n).

```kotlin
fun sieveOfEratosthenes(n: Int): List<Int> {
    val isPrime = BooleanArray(n + 1) { it >= 2 }
    var i = 2
    while (i * i <= n) {
        if (isPrime[i]) {
            var j = i * i
            while (j <= n) {
                isPrime[j] = false
                j += i
            }
        }
        i++
    }
    return (2..n).filter { isPrime[it] }
}
```

Interviewers sometimes ask "check if n is prime" as a warm-up, which is just trial division up to sqrt(n). The sieve is for when you need all primes up to n.

#### Q13: What is modular arithmetic and why does it matter in coding problems?

Modular arithmetic keeps numbers from overflowing by taking the remainder after division. The common modulus is 10^9 + 7, a large prime chosen because it fits in a 32-bit integer and has nice properties for modular inverse.

Key properties:
- `(a + b) % m = ((a % m) + (b % m)) % m`
- `(a * b) % m = ((a % m) * (b % m)) % m`
- Subtraction needs care: `((a % m) - (b % m) + m) % m` to avoid negatives.
- Division requires modular inverse (Fermat's little theorem: `a^(m-2) % m` when m is prime).

These show up in DP and combinatorics problems where intermediate values can be astronomically large.

#### Q14: How do you compute a^b mod m efficiently?

Use binary exponentiation (fast power). Instead of multiplying a by itself b times, square the base and halve the exponent at each step. If the exponent is odd, multiply the result by the current base. Time O(log b).

```kotlin
fun modPow(base: Long, exp: Long, mod: Long): Long {
    var result = 1L
    var b = base % mod
    var e = exp
    while (e > 0) {
        if (e % 2 == 1L) result = result * b % mod
        b = b * b % mod
        e /= 2
    }
    return result
}
```

This is essential for problems involving large exponents. Naive exponentiation would overflow or time out, but binary exponentiation handles exponents in the billions.

#### Q15: How do you determine if a number is a power of three without loops or recursion?

The largest power of 3 that fits in a 32-bit integer is 3^19 = 1162261467. If n is a power of 3, then 3^19 % n must be 0 because 3 is prime and its only factors are powers of 3. So the check is `n > 0 && 1162261467 % n == 0`. Time O(1).

The same trick works for any prime base — find the largest power that fits in the integer range and check divisibility.

#### Q16: How do you find the Hamming distance between two integers?

Hamming distance is the number of positions where the corresponding bits differ. XOR the two numbers — the result has 1s exactly where they differ. Then count the set bits. Time O(1).

```kotlin
fun hammingDistance(x: Int, y: Int): Int {
    var xor = x xor y
    var count = 0
    while (xor != 0) {
        xor = xor and (xor - 1)
        count++
    }
    return count
}
```

#### Q17: How do you add two integers without using + or - operators?

XOR gives the sum without carries. AND followed by left shift gives the carry. Repeat until there's no carry. This is literally how hardware adders work at the circuit level.

```kotlin
fun getSum(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val carry = x and y
        x = x xor y
        y = carry shl 1
    }
    return x
}
```

#### Q18: How do you solve the "counting bits" problem for numbers appearing three times except one?

When every number appears three times and one appears once, XOR alone doesn't work. Count each bit position across all numbers. If a bit position's count isn't divisible by 3, that bit belongs to the unique number. Time O(32n) = O(n), space O(1).

```kotlin
fun singleNumberII(nums: IntArray): Int {
    var result = 0
    for (bit in 0 until 32) {
        var count = 0
        for (num in nums) {
            if ((num shr bit) and 1 == 1) count++
        }
        if (count % 3 != 0) result = result or (1 shl bit)
    }
    return result
}
```

This generalizes to any "appears k times except one" — just change the modulus from 3 to k.

### Common Follow-ups

- How would you swap two numbers using XOR without a temp variable?
- What's the difference between arithmetic right shift and logical right shift?
- How do you find the only number that appears an odd number of times in an array?
- Can you solve "single number" if one number appears once and all others appear three times using only O(1) space and without bit counting per position?
- How do you check if two integers have opposite signs using XOR?
- What's the time complexity of the Sieve of Eratosthenes and why is it not O(n^2)?
- How would you compute the number of prime factors of a number?
- How does the bitmask DP approach work for the traveling salesman problem?
