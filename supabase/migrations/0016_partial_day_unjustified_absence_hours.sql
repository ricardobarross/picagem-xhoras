-- Permite registar, no mesmo dia de "Trabalho", um número de horas em
-- falta sem justificação (ex: saiu mais cedo, chegou atrasado) — sem ter
-- de marcar o dia inteiro como "Falta Injustificada". Coexiste com
-- hours_worked. Pedido por Ricardo (12/10/2026): saiu às 12h30 na
-- sexta-feira 09/10/2026, registou "Trabalho: 4h" nesse dia, mas faltam
-- 3,5h sem desconto porque o esquema anterior só tinha um tipo exclusivo
-- por dia.
ALTER TABLE time_entries
  ADD COLUMN unjustified_absence_hours numeric NOT NULL DEFAULT 0
  CHECK (unjustified_absence_hours >= 0);

COMMENT ON COLUMN time_entries.unjustified_absence_hours IS
  'Horas em falta sem justificação dentro de um dia normalmente trabalhado (ex: saiu mais cedo). Coexiste com hours_worked, ao contrário de entry_type=''unjustified_absence'' que marca o dia inteiro como falta. Pedido por Ricardo (10/2026).';
