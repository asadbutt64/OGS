import numpy as np
from compute_backend import xp, backend_env
from scoring import VinaLikeScorer
from search import PoseSearch

def main():
    print("====================================================")
    print("      Omnigene Docking Engine (ODE) Prototype       ")
    print(f"      Active Backend: {backend_env.upper()}         ")
    print("====================================================")

    # 1. Create a toy receptor (4 atoms)
    rec_coords = np.array([
        [0.0, 0.0, 0.0],
        [1.5, 0.0, 0.0],
        [0.0, 1.5, 0.0],
        [1.5, 1.5, 0.0]
    ])
    rec_types = ['O', 'C', 'N', 'C']

    # 2. Create a toy ligand (4 atoms) with one rotatable bond (bond between atom 1 and 2)
    lig_coords = np.array([
        [0.0, 0.0, 2.5],
        [1.0, 0.0, 2.5],
        [1.0, 1.0, 2.5],
        [2.0, 1.0, 2.5]
    ])
    lig_types = ['C', 'C', 'N', 'O']
    
    bonds_list = [
        (0, 1, 1),
        (1, 2, 1), # rotatable single bond between C-N
        (2, 3, 1)
    ]
    rotatable_bonds = [(1, 2)]

    pocket_center = [0.75, 0.75, 0.0]

    # 3. Instantiate scorer and search
    scorer = VinaLikeScorer()
    search = PoseSearch(
        scorer=scorer,
        rec_coords=rec_coords,
        rec_types=rec_types,
        lig_coords=lig_coords,
        lig_types=lig_types,
        bonds_list=bonds_list,
        rotatable_bonds=rotatable_bonds,
        pocket_center=pocket_center
    )

    print("\nRunning multi-seed iterated local search (Monte Carlo + gradient updates)...")
    results = search.run_multi_seed(num_seeds=5)

    print("\nDocking Results:")
    for rank, (coords, score) in enumerate(results, 1):
        print(f"  Rank {rank}: Binding Free Energy (dG) = {score:.4f} kcal/mol")
        print(f"          Top Atom Coord: {coords[0]}")
    print("====================================================")

if __name__ == "__main__":
    main()
