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
  /** Sinopse por idioma da interface (Miguel, 26/08 — "tudo internacional").
   *  pt = pt-BR; en = todas as demais (fallback internacional). */
  sinopses: { pt: string; en: string };
  arquivo: string; // caminho em /public/biblioteca-livre/
  capa: string;    // idem (svg)
  demoTraducao: boolean;
}

export const BIBLIOTECA_LIVRE: LivroLivre[] = [
  { id: "casmurro", titulo: "Dom Casmurro", autor: "Machado de Assis", idioma: "pt", bandeira: "🇧🇷", tema: "literatura",
    sinopses: { pt: "Bentinho conta a vida inteira tentando responder à pergunta que o devora: foi traído ou inventou a traição? O romance mais perturbador de Machado — ciúme, memória e a dúvida que não fecha nunca.", en: "Bentinho tells his whole life trying to answer the question that devours him: was he betrayed, or did he invent the betrayal? Machado's most disturbing novel — jealousy, memory, and a doubt that never closes." },
    arquivo: "/biblioteca-livre/casmurro_pt.epub", capa: "/biblioteca-livre/capa_real_casmurro.jpg", demoTraducao: false },
  { id: "austen", titulo: "Pride and Prejudice", autor: "Jane Austen", idioma: "en", bandeira: "🇬🇧", tema: "literatura",
    sinopses: { pt: "Elizabeth Bennet e Mr. Darcy se desdenham, se provocam e se descobrem. A comédia de costumes mais afiada da língua inglesa — inteligência, orgulho e segundas impressões.", en: "Elizabeth Bennet and Mr. Darcy disdain, provoke, and discover each other. The sharpest comedy of manners in the English language — wit, pride, and second impressions." },
    arquivo: "/biblioteca-livre/austen_en.epub", capa: "/biblioteca-livre/capa_real_austen.jpg", demoTraducao: true },
  { id: "candide", titulo: "Candide, ou l'optimisme", autor: "Voltaire", idioma: "fr", bandeira: "🇫🇷", tema: "filosofia",
    sinopses: { pt: "Cândido é expulso do paraíso e roda o mundo aprendendo que 'tudo vai pelo melhor' não resiste a um terremoto. A sátira filosófica mais veloz e engraçada do Iluminismo.", en: "Candide is expelled from paradise and roams the world learning that 'everything is for the best' can't survive an earthquake. The Enlightenment's fastest, funniest philosophical satire." },
    arquivo: "/biblioteca-livre/candide_fr.epub", capa: "/biblioteca-livre/capa_candide_nova.svg", demoTraducao: true },
  { id: "quixote", titulo: "Don Quijote", autor: "Miguel de Cervantes", idioma: "es", bandeira: "🇪🇸", tema: "literatura",
    sinopses: { pt: "Um fidalgo enlouquece de tanto ler romances de cavalaria e sai pela Espanha lutando contra moinhos de vento. O primeiro romance moderno — e ainda o mais humano.", en: "A hidalgo goes mad from too much chivalric romance and roams Spain fighting windmills. The first modern novel — and still the most human." },
    arquivo: "/biblioteca-livre/quixote_es.epub", capa: "/biblioteca-livre/capa_quixote_nova.svg", demoTraducao: true },
  { id: "dante", titulo: "La Divina Commedia", autor: "Dante Alighieri", idioma: "it", bandeira: "🇮🇹", tema: "poesia",
    sinopses: { pt: "Dante desce ao Inferno, sobe o Purgatório e alcança o Paraíso guiado por Virgílio e Beatriz. A viagem total da alma humana — o poema que fundou a língua italiana.", en: "Dante descends into Hell, climbs Purgatory, and reaches Paradise guided by Virgil and Beatrice. The total journey of the human soul — the poem that founded the Italian language." },
    arquivo: "/biblioteca-livre/dante_it.epub", capa: "/biblioteca-livre/capa_dante_nova.svg", demoTraducao: true },
  { id: "kafka", titulo: "Die Verwandlung", autor: "Franz Kafka", idioma: "de", bandeira: "🇩🇪", tema: "literatura",
    sinopses: { pt: "Gregor Samsa acorda transformado num inseto monstruoso — e a família não sabe o que fazer com ele. A novela definitiva sobre estranhamento, culpa e o inexplicável.", en: "Gregor Samsa wakes up transformed into a monstrous insect — and his family doesn't know what to do with him. The definitive novella about estrangement, guilt, and the inexplicable." },
    arquivo: "/biblioteca-livre/kafka_de.epub", capa: "/biblioteca-livre/capa_kafka_nova.svg", demoTraducao: true },
  { id: "confucio", titulo: "論語 (Analectos)", autor: "Confúcio", idioma: "zh", bandeira: "🇨🇳", tema: "filosofia",
    sinopses: { pt: "Os diálogos de Confúcio sobre virtude, governo e a vida boa — 2.500 anos de sabedoria chinesa em frases curtas que atravessam civilizações.", en: "Confucius' dialogues on virtue, government, and the good life — 2,500 years of Chinese wisdom in short sayings that cross civilizations." },
    arquivo: "/biblioteca-livre/confucio.epub", capa: "/biblioteca-livre/capa_confucio.svg", demoTraducao: true },
  { id: "maiakovsky", titulo: "Облако в штанах", autor: "Vladimir Maiakovski", idioma: "ru", bandeira: "🇷🇺", tema: "poesia",
    sinopses: { pt: "A Nuvem de Calças: o poema-trovão do futurismo russo — amor, raiva e revolução gritados em versos que parecem tiros. Maiakovski no auge da potência.", en: "A Cloud in Trousers: the thunder-poem of Russian Futurism — love, rage, and revolution shouted in verses that read like gunfire. Mayakovsky at full power." },
    arquivo: "/biblioteca-livre/maiakovsky_ru.epub", capa: "/biblioteca-livre/capa_maiakovsky.svg", demoTraducao: true },
];
