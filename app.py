import numpy as np
import pandas as pd
from flask import Flask, render_template, request

app = Flask(__name__)
datasets = ["blobs", "circles", "lines", "moons", "uniform"]

DATASETS_PATH = "static/datasets"

# helper functions

def load_points(dataset: str) -> np.ndarray:
    # Return (N, 2) float array for the given dataset name.
    df = pd.read_csv(f"{DATASETS_PATH}/{dataset}.csv")
    return df[["x", "y"]].values.astype(float)


def assign_labels(points: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    # Return integer label array — index of the nearest centroid per point.
    # distances shape: (N, k)
    diffs = points[:, None, :] - centroids[None, :, :]
    dists = np.linalg.norm(diffs, axis=2)             
    return np.argmin(dists, axis=1)                  

def recompute_centroids(points: np.ndarray, labels: np.ndarray, k: int) -> np.ndarray:
    # Move each centroid to the mean of its assigned points.
    centroids = np.zeros((k, 2))
    for i in range(k):
        mask = labels == i
        if mask.any():
            centroids[i] = points[mask].mean(axis=0)
        # else centroid keeps its previous position
    return centroids


def kmeans_step(points: np.ndarray, centroids: np.ndarray):
    # Return new centroids and labels after one K-means iteration.
    k = len(centroids)
    labels = assign_labels(points, centroids)
    new_centroids = recompute_centroids(points, labels, k)

    # Handle empty clusters: keep old centroid position
    for i in range(k):
        if not (labels == i).any():
            new_centroids[i] = centroids[i]

    return new_centroids, labels


def converged(old: np.ndarray, new: np.ndarray, tol: float = 1e-6) -> bool:
    return np.linalg.norm(old - new) < tol


# routes
@app.route("/")
def index():
    return render_template("index.html", datasets=datasets)


@app.route("/load_dataset", methods=["POST"])
def load_dataset():
    data = request.get_json()
    points = load_points(data["dataset"])

    return {
        "points": points.tolist(),
        "x_extent": [float(points[:, 0].min()), float(points[:, 0].max())],
        "y_extent": [float(points[:, 1].min()), float(points[:, 1].max())],
    }


@app.route("/init_centroids", methods=["POST"])
def init_centroids():    
    data = request.get_json()
    points = load_points(data["dataset"])
    k = int(data["n_clusters"])

    indices = np.random.choice(len(points), size=k, replace=False)
    centroids = points[indices]

    return {"centroids": centroids.tolist()}


@app.route("/step", methods=["POST"])
def step():
    # perform one K-means iteration
    data = request.get_json()
    points = np.array(data["points"])
    old_centroids = np.array(data["centroids"])

    new_centroids, labels = kmeans_step(points, old_centroids)

    return {
        "centroids": new_centroids.tolist(),
        "labels": labels.tolist(),
        "converged": bool(converged(old_centroids, new_centroids)),
    }


@app.route("/run", methods=["POST"])
def run():
    # run K-means until convergence
    data = request.get_json()
    points = np.array(data["points"])
    centroids = np.array(data["centroids"])

    MAX_ITER = 300
    history = []

    for _ in range(MAX_ITER):
        new_centroids, labels = kmeans_step(points, centroids)
        history.append({
            "centroids": new_centroids.tolist(),
            "labels": labels.tolist(),
        })
        if converged(centroids, new_centroids):
            break
        centroids = new_centroids

    return {"history": history}


if __name__ == "__main__":
    app.run(debug=True)