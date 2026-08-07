export interface SelectedMedicine {
  name: string;
  genericName?: string;
}

export interface AllergyConflict {
  medicine: string;
  allergen: string;
}

export function checkAllergyConflicts(
  medicines: SelectedMedicine[],
  patientAllergies: string[],
): AllergyConflict[] {
  const conflicts: AllergyConflict[] = [];

  for (const medicine of medicines) {
    for (const allergen of patientAllergies) {
      const allergenLower = allergen.toLowerCase().trim();
      const nameLower = medicine.name.toLowerCase().trim();
      const genericLower = medicine.genericName?.toLowerCase().trim() ?? '';

      const nameMatch =
        nameLower.includes(allergenLower) || allergenLower.includes(nameLower);
      const genericMatch =
        genericLower.length > 0 &&
        (genericLower.includes(allergenLower) ||
          allergenLower.includes(genericLower));

      if (nameMatch || genericMatch) {
        conflicts.push({ medicine: medicine.name, allergen });
      }
    }
  }

  return conflicts;
}
