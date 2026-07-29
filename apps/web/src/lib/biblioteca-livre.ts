/**
 * biblioteca-livre — o catálogo da Livraria Livre do Moka (doc 18).
 *
 * 8 livros de domínio público REAL e garantido (edições e traduções livres),
 * servidos de /public/biblioteca-livre/ na leva de teste. Cada um com capa
 * e sinopse escritas por nós. O internauta escolhe o que baixar pra estante
 * (opt-in total — e pode remover tudo depois).
 */

export interface LivroLivre {
  id: string;
  titulo: string;
  autor: string;
  idioma: string;
  bandeira: string;
  tema: string;
  sinopse: string;
  arquivo: string; // caminho em /public/biblioteca-livre/
  capa: string;    // idem (svg)
  demoTraducao: boolean;
}

export const BIBLIOTECA_LIVRE: LivroLivre[] = [
  { id: "casmurro", titulo: "Dom Casmurro", autor: "Machado de Assis", idioma: "pt", bandeira: "🇧🇷", tema: "literatura",
    sinopse: "Bentinho conta a vida inteira tentando responder à pergunta que o devora: foi traído ou inventou a traição? O romance mais perturbador de Machado — ciúme, memória e a dúvida que não fecha nunca.",
    arquivo: "/biblioteca-livre/casmurro_pt.epub", capa: "/biblioteca-livre/capa_casmurro.svg", demoTraducao: false },
  { id: "austen", titulo: "Pride and Prejudice", autor: "Jane Austen", idioma: "en", bandeira: "🇬🇧", tema: "literatura",
    sinopse: "Elizabeth Bennet e Mr. Darcy se desdenham, se provocam e se descobrem. A comédia de costumes mais afiada da língua inglesa — inteligência, orgulho e segundas impressões.",
    arquivo: "/biblioteca-livre/austen_en.epub", capa: "/biblioteca-livre/capa_austen.svg", demoTraducao: true },
  { id: "candide", titulo: "Candide, ou l'optimisme", autor: "Voltaire", idioma: "fr", bandeira: "🇫🇷", tema: "filosofia",
    sinopse: "Cândido é expulso do paraíso e roda o mundo aprendendo que 'tudo vai pelo melhor' não resiste a um terremoto. A sátira filosófica mais veloz e engraçada do Iluminismo.",
    arquivo: "/biblioteca-livre/candide_fr.epub", capa: "/biblioteca-livre/capa_candide.svg", demoTraducao: true },
  { id: "quixote", titulo: "Don Quijote", autor: "Miguel de Cervantes", idioma: "es", bandeira: "🇪🇸", tema: "literatura",
    sinopse: "Um fidalgo enlouquece de tanto ler romances de cavalaria e sai pela Espanha lutando contra moinhos de vento. O primeiro romance moderno — e ainda o mais humano.",
    arquivo: "/biblioteca-livre/quixote_es.epub", capa: "/biblioteca-livre/capa_quixote.svg", demoTraducao: true },
  { id: "dante", titulo: "La Divina Commedia", autor: "Dante Alighieri", idioma: "it", bandeira: "🇮🇹", tema: "poesia",
    sinopse: "Dante desce ao Inferno, sobe o Purgatório e alcança o Paraíso guiado por Virgílio e Beatriz. A viagem total da alma humana — o poema que fundou a língua italiana.",
    arquivo: "/biblioteca-livre/dante_it.epub", capa: "/biblioteca-livre/capa_dante.svg", demoTraducao: true },
  { id: "kafka", titulo: "Die Verwandlung", autor: "Franz Kafka", idioma: "de", bandeira: "🇩🇪", tema: "literatura",
    sinopse: "Gregor Samsa acorda transformado num inseto monstruoso — e a família não sabe o que fazer com ele. A novela definitiva sobre estranhamento, culpa e o inexplicável.",
    arquivo: "/biblioteca-livre/kafka_de.epub", capa: "/biblioteca-livre/capa_kafka.svg", demoTraducao: true },
  { id: "confucio", titulo: "論語 (Analectos)", autor: "Confúcio", idioma: "zh", bandeira: "🇨🇳", tema: "filosofia",
    sinopse: "Os diálogos de Confúcio sobre virtude, governo e a vida boa — 2.500 anos de sabedoria chinesa em frases curtas que atravessam civilizações.",
    arquivo: "/biblioteca-livre/confucio.epub", capa: "/biblioteca-livre/capa_confucio.svg", demoTraducao: true },
  { id: "maiakovsky", titulo: "Облако в штанах", autor: "Vladimir Maiakovski", idioma: "ru", bandeira: "🇷🇺", tema: "poesia",
    sinopse: "A Nuvem de Calças: o poema-trovão do futurismo russo — amor, raiva e revolução gritados em versos que parecem tiros. Maiakovski no auge da potência.",
    arquivo: "/biblioteca-livre/maiakovsky_ru.epub", capa: "/biblioteca-livre/capa_maiakovsky.svg", demoTraducao: true },
];
