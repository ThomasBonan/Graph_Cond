export function exportGammes(data) {
  const result = {
    PureBasic: {},
    PureEnd: {},
    PureSmart: {}
  };

  // Génère la structure gammes
  for (const group of Object.values(data)) {
    for (const option of group) {
      const name = option.name;

      ["PureBasic", "PureEnd", "PureSmart"].forEach(gamme => {
        const status = option.gammes[gamme];

        result[gamme][name] = {
          included: status === "included",
          optional: status === "optional"
        };
      });
    }
  }

  // Crée le fichier
  const blob = new Blob(
    [`export const gammes = ${JSON.stringify(result, null, 2)};`],
    { type: "application/javascript" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gammes.js";
  a.click();
  URL.revokeObjectURL(url);
}