from compute_backend import xp, to_cpu

class VinaLikeScorer:
    """
    Implements Vina-like empirical scoring function:
    gauss1, gauss2, repulsion, hydrophobic, hbond, and torsional penalty.
    """
    def __init__(self, weights=None):
        self.weights = weights if weights else {
            "gauss1": -0.035579,
            "gauss2": -0.005156,
            "repulsion": 0.840245,
            "hydrophobic": -0.035069,
            "hbond": -0.587439,
            "torsion": 0.05846
        }

    def score(self, lig_coords, rec_coords, lig_types, rec_types, rotatable_bonds_count):
        """
        Matrix-accelerated Vina-like scoring.
        lig_coords: shape (N_lig, 3)
        rec_coords: shape (N_rec, 3)
        lig_types: list of element symbols or array of symbols
        rec_types: list of element symbols or array of symbols
        """
        # Coordinate diffs
        diff = lig_coords[:, None, :] - rec_coords[None, :, :]
        dist = xp.sqrt(xp.sum(diff**2, axis=-1))

        # 1. gauss1
        g1 = xp.exp(-(dist / 0.5)**2)
        # 2. gauss2
        g2 = xp.exp(-((dist - 3.0) / 2.0)**2)
        # 3. repulsion
        d_opt = 3.2
        rep = xp.where(dist < d_opt, (dist - d_opt)**2, 0.0)

        # 4. hydrophobic
        is_lig_hydro = xp.array([t.upper() in ['C', 'S', 'F', 'CL', 'BR', 'I'] for t in lig_types])
        is_rec_hydro = xp.array([t.upper() in ['C', 'S', 'F', 'CL', 'BR', 'I'] for t in rec_types])
        hydro_mask = is_lig_hydro[:, None] * is_rec_hydro[None, :]
        hydro_raw = xp.where(dist <= 1.5, 1.0, xp.where(dist >= 3.0, 0.0, 1.0 - (dist - 1.5)/1.5))
        hydro = hydro_raw * hydro_mask

        # 5. hbond
        is_lig_polar = xp.array([t.upper() in ['N', 'O'] for t in lig_types])
        is_rec_polar = xp.array([t.upper() in ['N', 'O'] for t in rec_types])
        hbond_mask = is_lig_polar[:, None] * is_rec_polar[None, :]
        hbond_raw = xp.where(dist <= 2.5, 1.0, xp.where(dist >= 3.5, 0.0, 1.0 - (dist - 2.5)/1.0))
        hbond = hbond_raw * hbond_mask

        term_g1 = xp.sum(g1)
        term_g2 = xp.sum(g2)
        term_rep = xp.sum(rep)
        term_hydro = xp.sum(hydro)
        term_hbond = xp.sum(hbond)

        energy = (
            self.weights["gauss1"] * term_g1 +
            self.weights["gauss2"] * term_g2 +
            self.weights["repulsion"] * term_rep +
            self.weights["hydrophobic"] * term_hydro +
            self.weights["hbond"] * term_hbond
        )

        torsion_penalty = 1.0 + self.weights["torsion"] * rotatable_bonds_count
        final_score = energy / torsion_penalty
        return float(to_cpu(final_score))
