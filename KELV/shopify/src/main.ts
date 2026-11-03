import { SkinAnalysis } from '@/analysis/skin-analysis';
import { Header } from '@/chrome/header';
import { Gallery } from '@/home/gallery';
import { Hero } from '@/home/hero';
import { HeroSceneElement } from '@/home/hero-scene';
import { Join } from '@/home/join';
import { Loop } from '@/home/loop';
import { Pillars } from '@/home/pillars';
import { Travel } from '@/home/travel';
import { define } from '@/lib/element';
import { startRouter } from '@/lib/router';
import { reveal, startScroll, whenBooted } from '@/lib/scroll';
import { Preloader } from '@/preloader/preloader';
import { CartDrawer } from '@/shop/cart-drawer';
import { Collection } from '@/shop/collection';
import { EmailForm } from '@/shop/email-form';
import { MoreInfo } from '@/shop/more-info';
import { Policy } from '@/shop/policy';
import { Product } from '@/shop/product';
import { ProductViewer } from '@/shop/product-viewer';
import { RevealsElement } from '@/ui/reveals-element';

startScroll({ loop: !document.documentElement.dataset.page });

// Defined after the scroll has started: elements already in the page connect right here.
// The loop first, so it copies the hero before the hero's reveals change its markup.
define('kelv-loop', Loop);
define('kelv-preloader', Preloader);
define('kelv-reveals', RevealsElement);
define('kelv-header', Header);
define('kelv-hero', Hero);
define('kelv-hero-scene', HeroSceneElement);
define('kelv-pillars', Pillars);
define('kelv-gallery', Gallery);
define('kelv-join', Join);
define('kelv-travel', Travel);
define('kelv-policy', Policy);
define('kelv-email-form', EmailForm);
define('kelv-collection', Collection);
define('kelv-product', Product);
define('kelv-product-viewer', ProductViewer);
define('kelv-more-info', MoreInfo);
define('kelv-cart-drawer', CartDrawer);
define('kelv-skin-analysis', SkinAnalysis);

startRouter();

// Without the preloader (a layer page loaded directly), the page is revealed as soon as it is painted.
if (!document.querySelector('kelv-preloader')) whenBooted(() => requestAnimationFrame(reveal));
