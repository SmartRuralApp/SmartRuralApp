import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier, plot_tree
import matplotlib.pyplot as plt

# Load dataset
data = pd.read_csv("breast_cancer.csv")

# Features and target
X = data.drop("target", axis=1)
y = data["target"]

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=0)

# Create model
dt = DecisionTreeClassifier(random_state=0)

# Train model
dt.fit(X_train, y_train)

# Predict
y_pred = dt.predict(X_test)

# Accuracy
accuracy = dt.score(X_test, y_test)

# Output
print("Decision Tree Classifier")
print("-------------------------")
print("Accuracy:", accuracy)

# Predict new sample
sample = X_test.iloc[0].values.reshape(1, -1)
print("Predicted class:", dt.predict(sample))

# 🌳 Plot Decision Tree
plt.figure(figsize=(15,10))
plot_tree(dt,
          feature_names=X.columns,
          class_names=["Malignant", "Benign"],
          filled=True)
plt.title("Decision Tree")
plt.show()
