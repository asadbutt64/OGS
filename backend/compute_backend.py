import os
import numpy as np

backend_env = os.environ.get("ODE_BACKEND", "cpu").lower()

if backend_env == "cuda":
    try:
        import cupy as cp
        xp = cp
        print("Omnigene Docking Engine: Using NVIDIA CUDA GPU Acceleration (via CuPy)")
    except ImportError:
        print("Omnigene Docking Engine WARNING: CuPy not found. Falling back to CPU (NumPy).")
        xp = np
elif backend_env == "opencl":
    print("Omnigene Docking Engine: OpenCL detected. Routing computation through NumPy (CPU Fallback).")
    xp = np
else:
    xp = np
    print("Omnigene Docking Engine: Using standard CPU (NumPy)")

def to_cpu(arr):
    if hasattr(arr, "get"):
        return arr.get()
    return arr
