# Vaultly DSA & ADA Documentation (Member 1)

This document formalizes the Data Structures and Algorithms (DSA) and Analysis and Design of Algorithms (ADA) concepts implemented in Vaultly.

---

## 1. Linear Search Algorithm (`linear_search`)

### Problem Solved
Filtering a collection of product records based on a search string entered by the user. The search matches substrings across both product name and brand name case-insensitively.

### Input
- `products`: An array of product dictionaries $[p_1, p_2, \dots, p_n]$.
- `query`: A search string $Q$ (e.g., `"sony"`, `"laptop"`).

### Output
- A filtered array containing only products where $Q \subseteq \text{name}$ or $Q \subseteq \text{brand}$.

### Algorithm Steps
1. If $Q$ is empty, return the entire array.
2. Convert $Q$ to lowercase and strip whitespace.
3. Initialize an empty list `matched = []`.
4. Iterate sequentially through each element $p \in \text{products}$:
   - Convert $p[\text{"name"}]$ and $p[\text{"brand"}]$ to lowercase.
   - If $Q$ is a substring of either, append $p$ to `matched`.
5. Return `matched`.

### Complexity Analysis
- **Time Complexity**:
  - Worst Case: $O(n \cdot m)$ where $n$ is the number of products and $m$ is the average string length. Since $m \le 100$ (constant upper bound for names), time complexity is strictly **$O(n)$** (Linear).
  - Best Case: $O(n)$ (full scan required to find all occurrences).
- **Space Complexity**:
  - Auxiliary Space: **$O(1)$** beyond the output slice.

---

## 2. Merge Sort Algorithm (`merge_sort`)

### Problem Solved
Sorting products by numerical price (Low $\leftrightarrow$ High) or ISO-8601 purchase date string (Newest $\leftrightarrow$ Oldest).

### Algorithmic Paradigm
**Divide and Conquer**

### Algorithm Steps
1. **Divide**: Find the midpoint index $\text{mid} = \lfloor n / 2 \rfloor$.
2. **Conquer**: Recursively call `merge_sort` on the left half $[0 \dots \text{mid}-1]$ and right half $[\text{mid} \dots n-1]$ until base condition ($n \le 1$) is reached.
3. **Combine (`_merge`)**:
   - Maintain pointers $i$ and $j$ at the start of left and right subarrays.
   - Compare values extracted via `key_fn(left[i])` and `key_fn(right[j])`.
   - Append smaller (or larger if descending) element to the merged array and advance corresponding pointer.
   - Append remaining elements from either subarray.

### Recurrence Relation
$$T(n) = 2T\left(\frac{n}{2}\right) + \Theta(n)$$
By Master Theorem (Case 2: $a = 2, b = 2, f(n) = \Theta(n)$), $n^{\log_b a} = n^1 = \Theta(n)$.
Therefore:
$$T(n) = \Theta(n \log n)$$

### Complexity Analysis
- **Time Complexity**:
  - Best Case: **$O(n \log n)$**
  - Average Case: **$O(n \log n)$**
  - Worst Case: **$O(n \log n)$** (Unlike Quick Sort, Merge Sort guarantees $O(n \log n)$ even on reverse-sorted inputs).
- **Space Complexity**:
  - Auxiliary Space: **$O(n)$** for temporary merged arrays.
- **Stability**:
  - **Stable**: Elements with identical comparison values retain their relative original order ($<=$ condition).

---

## 3. Hash-Based Dictionary Lookup (Session & User Management)

### Problem Solved
Rapid token validation and credential lookup during API authentication.

### Data Structure
Hash Table / Python Dictionary (`sessions = { token: user_id }`).

### Complexity Analysis
- **Average Time Complexity**: **$O(1)$** lookup, insertion, and deletion.
- **Worst Case Time Complexity**: $O(n)$ (under pathological hash collision, mitigated by cryptographic 256-bit hash keys).
- **Space Complexity**: **$O(k)$** where $k$ is the number of active authenticated sessions.

---

## 4. SQL Aggregations & Grouping (ADA Concept)

### Problem Solved
Computing lifetime total spending, unit averages, and category breakdowns without loading all database records into memory.

### SQL Queries
```sql
-- Category Spending Breakdown
SELECT category, COUNT(*) as count, ROUND(SUM(price), 2) as total_spent
FROM Products
WHERE user_id = ?
GROUP BY category
ORDER BY total_spent DESC;
```

### ADA Complexity
- **Time Complexity**: $O(n \log k)$ where $n$ is product count and $k$ is unique categories (utilizing index scan and hash aggregation).
- **Memory Efficiency**: Computation occurs directly inside the SQLite engine in C, minimizing memory overhead in Python.
