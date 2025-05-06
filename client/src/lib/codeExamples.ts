export const codeExamples: Record<string, string> = {
  "Multiple Plots Example": `# Create multiple plots in a single run
import matplotlib
matplotlib.use('Agg')  # Use Agg backend for best compatibility
import matplotlib.pyplot as plt
import numpy as np

# Create data for plots
x = np.linspace(0, 10, 100)

# First plot - Sine wave
plt.figure(1, figsize=(6, 4))
plt.plot(x, np.sin(x), 'b-')
plt.title('Sine Wave')
plt.grid(True)

# Second plot - Cosine wave
plt.figure(2, figsize=(6, 4))
plt.plot(x, np.cos(x), 'r-')
plt.title('Cosine Wave')
plt.grid(True)

# Third plot - Tangent wave (with limited y range)
plt.figure(3, figsize=(6, 4))
plt.plot(x, np.tan(x), 'g-')
plt.ylim(-5, 5)  # Limit y axis for better visualization
plt.title('Tangent Wave')
plt.grid(True)

# Show all plots
plt.figure(1)
plt.show()
plt.figure(2)
plt.show()
plt.figure(3)
plt.show()

print("Three separate plots were created")
`,

  "Ultra Simple Plot": `# The absolute simplest matplotlib example
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Create the most basic possible plot with minimal properties
plt.figure(figsize=(4, 3))
plt.plot([0, 1, 2, 3, 4], [0, 1, 4, 9, 16])
plt.show()
`,
  "Simple Line Plot": `# The most basic matplotlib example possible
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use Agg backend for best compatibility
import matplotlib.pyplot as plt

# Create a very simple plot
x = np.array([1, 2, 3, 4, 5])
y = np.array([1, 4, 9, 16, 25])

# Create the simplest possible figure
plt.figure()
plt.plot(x, y)
plt.title('Simple Square Function')

# Show the plot window
plt.show()
`,
  "Random Number Generator": `import random

def generate_random_numbers(n, min_val=1, max_val=100):
    """Generate a list of n random numbers between min_val and max_val."""
    return [random.randint(min_val, max_val) for _ in range(n)]

# Generate 10 random numbers between 1 and 100
random_numbers = generate_random_numbers(10)
print(f"Generated numbers: {random_numbers}")

# Calculate statistics
average = sum(random_numbers) / len(random_numbers)
maximum = max(random_numbers)
minimum = min(random_numbers)

print(f"Average: {average:.2f}")
print(f"Maximum: {maximum}")
print(f"Minimum: {minimum}")
`,

  "Matplotlib Plot": `import numpy as np

# First set non-interactive backend before importing pyplot
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Generate data for the plot
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create a simple line plot with minimal settings
plt.figure()
plt.plot(x, y, 'b-')
plt.title('Sine Wave')
plt.grid(True)

# Save the figure (just to ensure it's properly rendered)
plt.tight_layout()
plt.show()

# Print some information
print(f"X range: {min(x)} to {max(x)}")
print(f"Y range: {min(y):.2f} to {max(y):.2f}")
`,

  "Pandas DataFrame": `import pandas as pd
import numpy as np

# Create a simple DataFrame
data = {
    'Name': ['Alice', 'Bob', 'Charlie', 'David', 'Eva'],
    'Age': [25, 30, 35, 40, 45],
    'Score': [88.5, 92.0, 79.5, 95.5, 87.0]
}

# Create a DataFrame
df = pd.DataFrame(data)

# Display the DataFrame
print("DataFrame:")
print(df)

# Basic statistics
print("")
print("Basic Statistics:")
print(df.describe())

# Filter data
print("")
print("People with score > 90:")
print(df[df['Score'] > 90])
`,

  "Simple Input Example": `# This is a basic example of using standard input in Python
# In the browser, this will show prompt dialogs

# Get user input through browser prompt
name = input("What is your name? ")
print(f"Hello, {name}! Welcome to PyScript.")

# Ask another question
favorite_color = input("What is your favorite color? ")
print(f"I like {favorite_color} too!")

# Try some basic math with user input
try:
    number = int(input("Enter a number: "))
    print(f"Your number squared is {number ** 2}")
    print(f"Your number doubled is {number * 2}")
except ValueError:
    print("That wasn't a valid number!")
`,

  "User Input Demo": `# This example demonstrates how to get user input
# When input() is called, a browser prompt will appear

name = input("Enter your name: ")
age_str = input("Enter your age: ")

try:
    age = int(age_str)
    birth_year = 2025 - age
    print(f"Hello, {name}!")
    print(f"You were born around {birth_year}")
    
    if age >= 18:
        print("You are an adult.")
    else:
        print("You are a minor.")
        
    # Calculate some fun facts
    days_lived = age * 365
    print(f"You've lived approximately {days_lived:,} days!")
    
    if input("Do you want to see your age in dog years? (yes/no): ").lower() == "yes":
        dog_years = age * 7
        print(f"In dog years, you would be {dog_years} years old!")
    else:
        print("Maybe next time!")
        
except ValueError:
    print("Invalid age input. Please enter a number.")
`,

  "Simple Data Analysis": `import statistics

# Sample data
data = [12.5, 15.3, 18.2, 10.7, 9.8, 16.4, 14.0, 13.2]

# Calculate statistics
mean = statistics.mean(data)
median = statistics.median(data)
stdev = statistics.stdev(data)

print(f"Data: {data}")
print(f"Mean: {mean:.2f}")
print(f"Median: {median:.2f}")
print(f"Standard Deviation: {stdev:.2f}")

# Find min and max values
min_val = min(data)
max_val = max(data)
print(f"Minimum: {min_val}")
print(f"Maximum: {max_val}")
`,

  "Temperature Converter": `# This program converts between temperature units
# It also demonstrates user input functionality

def celsius_to_fahrenheit(celsius):
    return (celsius * 9/5) + 32

def fahrenheit_to_celsius(fahrenheit):
    return (fahrenheit - 32) * 5/9

# Get user preference
conversion_type = input("Convert from (C)elsius to Fahrenheit or (F)ahrenheit to Celsius? Enter C or F: ").upper()

if conversion_type == 'C':
    try:
        temp = float(input("Enter temperature in Celsius: "))
        converted = celsius_to_fahrenheit(temp)
        print(f"{temp}°C = {converted:.1f}°F")
        
        # Provide some context
        if temp < 0:
            print("Brrr! That's below freezing!")
        elif temp > 30:
            print("That's hot!")
    except ValueError:
        print("Please enter a valid number.")
        
elif conversion_type == 'F':
    try:
        temp = float(input("Enter temperature in Fahrenheit: "))
        converted = fahrenheit_to_celsius(temp)
        print(f"{temp}°F = {converted:.1f}°C")
        
        # Provide some context
        if converted < 0:
            print("Brrr! That's below freezing!")
        elif converted > 30:
            print("That's hot!")
    except ValueError:
        print("Please enter a valid number.")
        
else:
    print("Invalid choice. Please enter 'C' or 'F'.")
`,

  "File Operations": `# This is a demonstration of file operations
# In the browser environment, we can simulate file operations

def write_to_file(filename, content):
    """Simulate writing to a file."""
    print(f"Writing to {filename}:")
    print(f"Content: {content}")
    return True

def read_from_file(filename):
    """Simulate reading from a file."""
    print(f"Reading from {filename}")
    # In a real file system, we would read the file content
    return f"This is simulated content from {filename}"

# Write to a file
write_to_file("example.txt", "Hello, Python in the browser!")

# Read from a file
content = read_from_file("example.txt")
print(content)
`,
};