const WIDTH = 500;
const HEIGHT = 500;
const PADDING = 40;
const COLOR_SCHEME = d3.schemeCategory10;

const svg = d3
  .select("svg#scatterplot")
  .attr("width", WIDTH)
  .attr("height", HEIGHT)
  .style("background", "#eee");

const datasetSelect = document.getElementById("dataset");
const clusterInput = document.getElementById("n_clusters");
const stepDisplay = document.getElementById("step");
const stepLabel = document.getElementById("step-label");
const backButton = document.getElementById("back");
const forwardButton = document.getElementById("forward");
const runButton = document.getElementById("run");
const resetButton = document.getElementById("reset");

const state = {
  dataset: datasetSelect.value,
  n_clusters: Number(clusterInput.value),
  points: [],
  centroids: [],
  labels: null,
  history: [],
  stepIndex: 0,
  x_extent: [0, 1],
  y_extent: [0, 1],
  converged: false,
};

const xScale = d3.scaleLinear().range([PADDING, WIDTH - PADDING]);
const yScale = d3.scaleLinear().range([HEIGHT - PADDING, PADDING]);

function load_and_plot(filename) {
  d3.csv(`static/datasets/${filename}`, d3.autoType).then((data) => {
    console.log("data", data);
    svg.selectAll("circle.raw").remove();
    svg
      .selectAll("circle.raw")
      .data(data)
      .join("circle")
      .attr("class", "raw")
      .attr("r", 8)
      .attr("fill", "#333")
      .attr("stroke", "#eee")
      .attr("stroke-width", 1)
      .attr("cx", (d) => d.x * 20 + 50)
      .attr("cy", (d) => d.y * 20 + 250);
  });
}

init();

function init() {
  bindControls();
  reset();
}

function bindControls() {
  datasetSelect.addEventListener("change", () => {
    state.dataset = datasetSelect.value;
    reset();
  });

  clusterInput.addEventListener("change", () => {
    state.n_clusters = Number(clusterInput.value);
    reset();
  });

  backButton.addEventListener("click", () => {
    if (state.stepIndex > 0) {
      state.stepIndex -= 1;
      applyHistoryStep();
    }
  });

  forwardButton.addEventListener("click", async () => {
    if (state.stepIndex < state.history.length - 1) {
      state.stepIndex += 1;
      applyHistoryStep();
      return;
    }

    if (!state.converged) {
      await stepOnce();
    }
  });

  runButton.addEventListener("click", async () => {
    await runToConvergence();
  });

  resetButton.addEventListener("click", () => {
    reset();
  });
}

async function reset() {
  state.labels = null;
  state.history = [];
  state.stepIndex = 0;
  state.converged = false;

  await loadDataset();
  await initCentroids();
  render();
}

async function loadDataset() {
  const response = await post("/load_dataset", { dataset: state.dataset });
  state.points = response.points.map(([x, y]) => ({ x, y }));
  state.x_extent = response.x_extent;
  state.y_extent = response.y_extent;
  xScale.domain(state.x_extent);
  yScale.domain(state.y_extent);
}

async function initCentroids() {
  const response = await post("/init_centroids", {
    dataset: state.dataset,
    n_clusters: state.n_clusters,
  });

  state.centroids = response.centroids.map(([x, y]) => ({ x, y }));
  state.labels = null;
  state.history = [createHistoryFrame(state.centroids, null)];
  state.stepIndex = 0;
  state.converged = false;
}

async function stepOnce() {
  const response = await post("/step", {
    points: state.points.map(({ x, y }) => [x, y]),
    centroids: state.centroids.map(({ x, y }) => [x, y]),
  });

  const nextCentroids = response.centroids.map(([x, y]) => ({ x, y }));
  const nextLabels = response.labels;
  state.centroids = nextCentroids;
  state.labels = nextLabels;
  state.converged = response.converged;

  state.history.push(createHistoryFrame(state.centroids, state.labels));
  state.stepIndex = state.history.length - 1;
  applyHistoryStep();
}

async function runToConvergence() {
  const response = await post("/run", {
    points: state.points.map(({ x, y }) => [x, y]),
    centroids: state.centroids.map(({ x, y }) => [x, y]),
  });

  const initialFrame = createHistoryFrame(state.centroids, state.labels);
  const historyFrames = response.history.map((frame) =>
    createHistoryFrame(
      frame.centroids.map(([x, y]) => ({ x, y })),
      frame.labels,
    ),
  );

  state.history = [initialFrame, ...historyFrames];
  state.stepIndex = state.history.length - 1;
  state.converged = true;
  applyHistoryStep();
}

function createHistoryFrame(centroids, labels) {
  return {
    centroids: centroids.map((c) => ({ x: c.x, y: c.y })),
    labels: labels ? [...labels] : null,
  };
}

function applyHistoryStep() {
  const frame = state.history[state.stepIndex];
  state.centroids = frame.centroids.map((c) => ({ x: c.x, y: c.y }));
  state.labels = frame.labels ? [...frame.labels] : null;
  render();
}

function render() {
  updateStepDisplay();
  drawPoints();
  drawCentroids();
}

function updateStepDisplay() {
  if (state.history.length > 1) {
    stepDisplay.textContent = `${state.stepIndex} / ${state.history.length - 1}`;
    stepLabel.textContent = "step:";
  } else {
    stepDisplay.textContent = "0";
    stepLabel.textContent = "step:";
  }
}

function drawPoints() {
  const color = d3.scaleOrdinal(COLOR_SCHEME).domain(d3.range(state.n_clusters));

  const points = svg.selectAll("circle.point").data(state.points, (d, i) => i);

  points
    .enter()
    .append("circle")
    .attr("class", "point")
    .attr("r", 6)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .merge(points)
    .attr("cx", (d) => xScale(d.x))
    .attr("cy", (d) => yScale(d.y))
    .attr("fill", (d, i) => {
      if (!state.labels) {
        return "#333";
      }
      const label = state.labels[i];
      return color(label);
    });

  points.exit().remove();
}

function drawCentroids() {
  const centroids = svg.selectAll("rect.centroid").data(state.centroids, (d, i) => i);

  centroids
    .enter()
    .append("rect")
    .attr("class", "centroid")
    .attr("width", 14)
    .attr("height", 14)
    .attr("x", (d) => xScale(d.x) - 7)
    .attr("y", (d) => yScale(d.y) - 7)
    .attr("stroke", "#000")
    .attr("stroke-width", 2)
    .attr("fill", (d, i) => COLOR_SCHEME[i % COLOR_SCHEME.length])
    .merge(centroids)
    .attr("x", (d) => xScale(d.x) - 7)
    .attr("y", (d) => yScale(d.y) - 7);

  centroids.exit().remove();
}

async function post(url = "", data = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return response.json();
}
