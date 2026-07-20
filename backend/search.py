import numpy as np
import hashlib
from compute_backend import xp, to_cpu

def get_subtree(start_atom, avoid_atom, num_atoms, bonds_list):
    """
    Finds the subtree (indices) starting from start_atom without crossing the avoid_atom.
    """
    adj = {i: [] for i in range(num_atoms)}
    for u, v, _ in bonds_list:
        if u < num_atoms and v < num_atoms:
            adj[u].append(v)
            adj[v].append(u)
            
    visited = set()
    queue = [start_atom]
    visited.add(avoid_atom) # prevent crossing
    
    subtree = []
    while queue:
        curr = queue.pop(0)
        if curr not in subtree and curr != avoid_atom:
            subtree.append(curr)
            for neighbor in adj[curr]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
    return subtree

def rotate_around_axis(coords, origin, axis, angle):
    """
    Applies Rodrigues' rotation formula to rotate coords around a normalized axis passing through origin.
    """
    cos_a = xp.cos(angle)
    sin_a = xp.sin(angle)
    rel = coords - origin
    dot = xp.sum(rel * axis, axis=-1, keepdims=True)
    # Using xp.cross for cross product
    cross = xp.cross(rel, axis)
    rotated = rel * cos_a + cross * sin_a + axis * dot * (1.0 - cos_a)
    return rotated + origin

class PoseSearch:
    def __init__(self, scorer, rec_coords, rec_types, lig_coords, lig_types, bonds_list, rotatable_bonds, pocket_center):
        self.scorer = scorer
        self.rec_coords = xp.array(rec_coords)
        self.rec_types = rec_types
        self.lig_coords = xp.array(lig_coords)
        self.lig_types = lig_types
        self.bonds_list = bonds_list
        self.rotatable_bonds = rotatable_bonds # List of (u, v) pairs
        self.pocket_center = xp.array(pocket_center)
        self.num_atoms = len(lig_coords)

        # Precalculate subtrees for rotatable bonds
        self.subtrees = []
        for u, v in self.rotatable_bonds:
            # We assume rotating subtree connected to v
            indices = get_subtree(v, u, self.num_atoms, self.bonds_list)
            self.subtrees.append((u, v, indices))

    def apply_pose(self, translation, rotation_angles, torsion_angles):
        """
        Applies rigid translation + rotation to lig_coords, and internal torsion subtree rotations.
        """
        coords = self.lig_coords.copy()
        
        # 1. Apply internal torsion rotations
        for idx, (u, v, indices) in enumerate(self.subtrees):
            if idx < len(torsion_angles) and len(indices) > 0:
                angle = torsion_angles[idx]
                axis = coords[v] - coords[u]
                norm = xp.linalg.norm(axis)
                if norm > 1e-6:
                    axis = axis / norm
                    origin = coords[u]
                    coords[indices] = rotate_around_axis(coords[indices], origin, axis, angle)

        # 2. Apply rigid translation and rotation around centroid
        centroid = xp.mean(coords, axis=0)
        coords = coords - centroid

        # Euler angles rotation
        tx, ty, tz = rotation_angles
        Rx = xp.array([
            [1, 0, 0],
            [0, xp.cos(tx), -xp.sin(tx)],
            [0, xp.sin(tx), xp.cos(tx)]
        ])
        Ry = xp.array([
            [xp.cos(ty), 0, xp.sin(ty)],
            [0, 1, 0],
            [-xp.sin(ty), 0, xp.cos(ty)]
        ])
        Rz = xp.array([
            [xp.cos(tz), -xp.sin(tz), 0],
            [xp.sin(tz), xp.cos(tz), 0],
            [0, 0, 1]
        ])
        R = Rz @ Ry @ Rx
        coords = coords @ R.T + centroid + translation
        return coords

    def run_one(self, seed=None):
        """
        Runs a single iterated local search (Monte Carlo + numerical gradient descent BFGS-like minimizer).
        """
        if seed is not None:
            # Initialize seed
            h = int(hashlib.md5(str(seed).encode()).hexdigest(), 16) % 2**32
            np.random.seed(h)

        # Start from random pose parameters
        best_trans = xp.array(np.random.uniform(-4.0, 4.0, size=3))
        best_rot = xp.array(np.random.uniform(-np.pi, np.pi, size=3))
        best_torsions = xp.array(np.random.uniform(-np.pi, np.pi, size=len(self.subtrees)))
        
        best_coords = self.apply_pose(best_trans, best_rot, best_torsions)
        best_score = self.scorer.score(best_coords, self.rec_coords, self.lig_types, self.rec_types, len(self.rotatable_bonds))

        # Iterated local search (MC + gradient descent cycles)
        for mc_step in range(10):
            # Perturb pose parameters (Monte Carlo step)
            t_pert = best_trans + xp.array(np.random.uniform(-1.0, 1.0, size=3))
            r_pert = best_rot + xp.array(np.random.uniform(-0.3, 0.3, size=3))
            tors_pert = best_torsions + xp.array(np.random.uniform(-0.3, 0.3, size=len(self.subtrees)))

            # Optimize perturbed parameters locally (Gradient Descent optimizer)
            for gd_iter in range(15):
                score_curr = self.scorer.score(
                    self.apply_pose(t_pert, r_pert, tors_pert),
                    self.rec_coords, self.lig_types, self.rec_types, len(self.rotatable_bonds)
                )
                
                # Compute numerical gradients
                grad_t = xp.zeros(3)
                eps = 1e-3
                for i in range(3):
                    t_eps = t_pert.copy()
                    t_eps[i] += eps
                    score_eps = self.scorer.score(
                        self.apply_pose(t_eps, r_pert, tors_pert),
                        self.rec_coords, self.lig_types, self.rec_types, len(self.rotatable_bonds)
                    )
                    grad_t[i] = (score_eps - score_curr) / eps
                    
                # Update parameters with line search
                t_pert = t_pert - 0.1 * grad_t

            # Accept or reject via Metropolis-like energy check
            final_coords = self.apply_pose(t_pert, r_pert, tors_pert)
            final_score = self.scorer.score(final_coords, self.rec_coords, self.lig_types, self.rec_types, len(self.rotatable_bonds))

            if final_score < best_score:
                best_score = final_score
                best_trans = t_pert
                best_rot = r_pert
                best_torsions = tors_pert
                best_coords = final_coords

        return best_coords, best_score

    def run_multi_seed(self, num_seeds=9):
        """
        Runs multiple independent docking searches with different seeds and returns ranked results.
        """
        results = []
        for i in range(num_seeds):
            coords, score = self.run_one(seed=12345 + i)
            results.append((coords, score))
        
        # Rank by score ascending (lowest binding energy is best)
        results.sort(key=lambda x: x[1])
        return results
