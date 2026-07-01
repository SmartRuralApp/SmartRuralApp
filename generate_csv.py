import pandas as pd
from sklearn.datasets import load_breast_cancer

data = load_breast_cancer(as_frame=True)
df = data.frame
df.to_csv('breast_cancer.csv', index=False)
print("breast_cancer.csv created.")
