import catalogue from '../product/catalogue.json';
import { PALETTE } from '../configurator/content';
import projects from './projects.json';

// OUR PROJECTS (Figma: Projects.pdf, Project Page CMS.pdf, Scrollable Info - Project.pdf). There were no texts for
// the projects: each render is a project, written for what it shows (projects.json), on the catalogue product it
// shows (its sizes, its drawing); the panel's specification texts come from the product's kind.
export type Project = (typeof projects)[number];
export { projects };

export const projectIndex = (slug: string | null) => projects.findIndex((p) => p.slug === slug);

interface Column {
  title: string;
  text: string;
}

const STEEL = 'Powder-coated steel, welded in our own workshop and finished in one of the five colours of the range.';
const BOARDS =
  'Brown recycled plastic boards, coloured through: no paint, no splinters, the same material across the range.';

/** What the panel says of the product's parts: two columns and the materials line. */
function partsOf(id: string, galvanised: boolean): { columns: [Column, Column]; materials: string } {
  const frame = galvanised ? 'Galvanised steel, left as it comes out of the bath: nothing to repaint, ever.' : STEEL;
  if (id.startsWith('K8'))
    return {
      columns: [
        {
          title: 'Supports',
          text: 'Two folded steel side supports, powder-coated in the accent colour, bolted to the paving.',
        },
        { title: 'Tubes', text: 'Galvanised steel tubes run through the supports and are locked from the inside.' },
      ],
      materials: 'Galvanised steel tubes between powder-coated steel side supports.',
    };
  if (id.startsWith('K1'))
    return {
      columns: [
        { title: 'Frame', text: frame },
        { title: 'Cladding', text: 'Vertical recycled plastic boards on all four sides, fixed from inside the frame.' },
      ],
      materials: 'Steel frame with a removable liner, clad in brown recycled plastic boards.',
    };
  if (['G1', 'K2', 'K3'].some((family) => id.startsWith(family)))
    return {
      columns: [
        { title: 'Body', text: `${frame} Emptied from the front with a single key.` },
        {
          title: 'Cladding',
          text: id.startsWith('G1')
            ? 'Recycled plastic slats over the liner, under a steel hood that keeps the rain out.'
            : 'Recycled plastic slats over the liner; the coloured rings say which stream goes where.',
        },
      ],
      materials: 'Steel body and hood with a galvanised liner, clad in brown recycled plastic slats.',
    };
  return {
    columns: [
      { title: 'Frame', text: frame },
      { title: 'Boards', text: BOARDS },
    ],
    materials: `${galvanised ? 'Galvanised' : 'Powder-coated'} steel frame with seat${
      id.startsWith('G4') ? '' : ' and backrest'
    } in brown recycled plastic boards.`,
  };
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1))} cm`;

/** Everything the panel shows of a project. */
export function detailsOf(project: Project) {
  const product = catalogue.find((p) => p.id === project.product)!;
  const galvanised = project.finish === 'galvanised';
  const colour = PALETTE.find((finish) => finish.id === project.finish);
  const [width, depth, height] = product.dimensions;
  return {
    product,
    ...partsOf(product.id, galvanised),
    dimensions: `H: ${cm(height)} × W: ${cm(width)} × D: ${cm(depth)}`,
    finish: galvanised
      ? 'Galvanised, no paint needed'
      : `${colour!.name}, ${colour!.note.startsWith('RAL') ? colour!.note : colour!.note.toLowerCase()}`,
    // the quote list's line (Figma's words, as QuoteDrawer has them)
    quote: `${project.pieces} ${project.pieces === 1 ? 'piece' : 'pieces'} in ${project.configurations} ${
      project.configurations === 1 ? 'configuration' : 'configurations'
    }. We reply with a quote in 48hrs. Our team do its best to response all the requests`,
  };
}
