import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, computed, effect, ElementRef, Inject, inject, PLATFORM_ID, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { catchError, of, tap } from 'rxjs';

export interface Card {
  id: number;
  srcUrl: string;
  title: string;
  text?: string;
  isActive: boolean;
  isVisible: boolean;
  isOpen?: boolean;
  uniqueId?: number;
}
export interface CardsData {
  slides: Card[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  cardsUrl = 'assets/slides.json';
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);

  screenWidth = signal(0);

  // Query all divs with a specific CSS class or tag selector
  @ViewChildren('slideElement') slides!: QueryList<ElementRef>;
  @ViewChild('sliderContainer', { static: false }) sliderContainer!: ElementRef<HTMLDivElement>;
  slideWidth = computed(() => {
    return this.screenWidth() < 1024 ? 142 : 340;
  });
  slideHeight = computed(() => {
    return this.slideWidth() === 340 ? 540 : 226;
  });
  // visibleSlidesCount = computed(() => {
  //   return this.screenWidth() < 1024 ? 1 : 2;
  // });
  visibleSlidesCount = signal(2);

  deltaX = signal<number | null>(null);
  deltaIndex = computed(() => {
    const deltaX = this.deltaX();
    if (deltaX === null) {
      return null
    }
    const maxSlides = this.visibleSlidesCount() * 2 + 1;
    const indexDelta = deltaX / (this.screenWidth() / maxSlides) * -1;
    if (Math.abs(indexDelta) > maxSlides) {
      return indexDelta > 0 ? maxSlides : maxSlides * -1;
    }
    return indexDelta;
  });
  indexCenter = signal(0);
  originalSlidesLength = 0;
  currentIndex = 0;
  isDragging = signal(false);
  start = {
    x: 0,
    y: 0
  }
  current = {
    x: 0,
    y: 0
  }
  currentTranslate = 0;
  prevTranslate = 0;
  opened = signal(false);

  trackById(index: number, item: Card) {
    return item.uniqueId;
  }

  getCards() {
    return this.http.get<CardsData>(this.cardsUrl).pipe(
      // tap(data => console.log('Полученные данные:', data)),
      catchError(error => {
        console.error('Ошибка при загрузке данных:', error);
        return of({ slides: [] });
      })
    );
  }

  constructor(
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.deltaX();
    if (isPlatformBrowser(this.platformId)) {
      this.screenWidth.set(window.innerWidth);
      window.addEventListener('resize', () => {
        this.screenWidth.set(window.innerWidth);
      });
    }
    effect(() => {
      const delta = this.deltaIndex();
      const indexCenter = this.indexCenter();

      // console.log('get slide transform effect');

      this.updateSlidePosition();
      this.updateActiveSlide();
    }, { allowSignalWrites: true });
    effect(() => {
      // console.log(this.closestToCurrentAngleIndex());
    });
  }
  originalSlides = signal<Card[] | null>(null);
  allSlides = computed(() => {
    const originalSlides = this.originalSlides();
    if (!originalSlides) return null;
    const visibleSlides = this.visibleSlidesCount() * 2 + 1;
    if (originalSlides !== null) {
      this.originalSlidesLength = originalSlides.length;
      if (this.originalSlidesLength >= visibleSlides) {
        const clonedSlides1 = originalSlides.map((slide, index) => ({
          ...slide,
          uniqueId: index + this.originalSlidesLength,
        }));
        return [...originalSlides, ...clonedSlides1];
      } else {
        return [...originalSlides];
      }
    }
    return null;
  });
  cnt = computed(() => {
    // console.log('allSlides ', this.allSlides());
    const slides = this.allSlides();
    // console.log('slides ', slides);
    return slides?.length || 0;
  })
  ngOnInit(): void {
    this.getCards().subscribe((data: { slides: Card[] }) => {
      if (data.slides) {
        this.originalSlides.set(data.slides.map((slide, index) => ({
          ...slide,
          uniqueId: index
        })));
      } else {
        console.error('No slides');
      }
      // Инициализируем оригинальный массив слайдов

      this.cdr.markForCheck();
    });
  }

  smoothDelta(delta: number, max: number): number {
    return Math.sign(delta) * Math.min(Math.abs(delta), max);
  }

  onDragStart(event: MouseEvent | TouchEvent) {
    console.log('drag start');
    this.isDragging.set(true);
    this.start.x = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    this.start.y = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    // console.log('start ', this.start.x, this.start.y);
  }

  onDrag(event: MouseEvent | TouchEvent) {
    // console.log('dragg')
    if (!this.isDragging()) return;

    this.current.x = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    this.current.y = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    const deltaX = this.current.x - this.start.x;
    // this.deltaX.set(this.smoothDelta(deltaX, 100));
    this.deltaX.set(deltaX);

    console.log('deltaX:', deltaX);
  }
  blockEvent = signal(false);
  onDragEnd(event: MouseEvent | TouchEvent) {
    // console.log('drag end');

    /* 1. взять координаты окончания клика из clientX и clientY */
    /* 2. сравнить координаты начала и окончания клика */
    const deltaX = this.current.x - this.start.x;
    const deltaY = this.current.y - this.start.y;

    /* 3. если они отличаются - блокируем клик */
    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      //блокируем клик
      this.blockEvent.set(true);
      this.indexCenter.set(this.closestToCurrentAngleIndex());
    } else {
      /* 4. если одинаковые - срабатывает метод toggleOpen */
      //открываем блок с информацией
      this.blockEvent.set(false);
    }

    // this.indexCenter.set(this.closestToCurrentAngleIndex());
    this.deltaX.set(0);
    this.isDragging.set(false);

    this.updateActiveSlide();
    console.log('Drag ended. New indexCenter:', this.indexCenter());
  }

  resetSlidePosition() {
    console.log('reset slide position');
  }

  /* в эту переменную я хочу записывать во время цикла перерисовки 
    индекс ближайшего к вертикальному положению элемента,
    а когда перерисовка закончится, я могу всегда взять это число и достать текущий индекс
  */
  closestToCurrentAngleIndex = signal(0);
  angles: number[] = [];

  updateSlidePosition() {
    const noTransition = this.isDragging();
    const slides = this.allSlides();
    const indexCenter = this.indexCenter();
    let newCenterIndex = this.closestToCurrentAngleIndex();
    if (slides) {
      // console.log('updateSlidePosition called');
      const deltaX = this.deltaX() || 0;
      const totalSlides = slides.length;
      const visibleSlides = this.visibleSlidesCount() * 2 + 1;
      // const maxDeltaX = 600;
      // this.deltaX.set(Math.min(Math.max((deltaX || 0), -maxDeltaX), maxDeltaX));
      const arcAngle = 12;
      const distance = this.screenWidth() < 1024 ? 1000 : 2600;
      this.angles = [];

      slides.forEach((slide, index) => {
        let angle: number;

        if (totalSlides <= visibleSlides) {
          angle = arcAngle * (index - indexCenter) + (deltaX || 0) / 50;
        } else {
          const relativeIndex = (index - indexCenter + totalSlides) % totalSlides;
          angle = arcAngle * (relativeIndex - Math.floor(totalSlides / 2)) + (deltaX || 0) / 50;
        }

        // console.log(angle);
        this.setDivStyleByIndex(index, 'transform-origin', `center ${distance}px`);
        this.setDivStyleByIndex(index, 'transform', `rotate(${angle}deg)`);
        this.setDivStyleByIndex(index, 'transition', noTransition ? 'none' : '500ms ease');

        this.angles[index] = angle;
        console.log(`Slide ${index}: angle = ${angle}`);

        if (Math.abs(angle) < arcAngle) {
          // console.log('я присвоил новый идекс');
          newCenterIndex = index;// + (deltaX >= 0 ? 1 : -1);
          // if (newCenterIndex < 0) newCenterIndex === 0;
          console.log(`Slide ${index} is closest to center`);
        }
      });
      // Определяем ближайший индекс по минимальному углу
      const closestIndex = this.angles.reduce((closest, current, index, arr) => {
        return Math.abs(current) < Math.abs(arr[closest]) ? index : closest;
      }, 0);
      this.closestToCurrentAngleIndex.set(closestIndex);
      console.log('closestToCurrentAngleIndex', this.closestToCurrentAngleIndex());
    }
  }

  // Function to access a div by index and manipulate its style
  setDivStyleByIndex(index: number, styleName: string, styleValue: string) {
    const divArray = this.slides.toArray();
    if (index >= 0 && index < divArray.length) {
      const divElement = divArray[index].nativeElement as HTMLElement;

      // Type-casting divElement.style as 'any' to allow dynamic property access
      (divElement.style as any)[styleName] = styleValue;
    } else {
      console.error('Index out of bounds');
    }
  }

  nextSlide() {
    const slides = this.allSlides();
    if (slides) {
      let newCurrentIndex: null | number = null;
      const currentIndex = this.indexCenter();

      if (slides.length <= this.visibleSlidesCount() * 2 + 1) {
        if (currentIndex < slides.length - 1) {
          // this.indexCenter.update(value => value + 1);
          newCurrentIndex = currentIndex + 1;
        }
      } else {
        // this.indexCenter.update(value => (value + 1) % this.slides.length);
        newCurrentIndex = (currentIndex + 1) % slides.length;
      }

      if (newCurrentIndex !== null) {
        this.indexCenter.set(newCurrentIndex);
        // console.log('setting new indexCenter value', this.indexCenter())
      }
    }
  }

  previousSlide() {
    const slides = this.allSlides();
    if (slides) {
      if (slides.length <= this.visibleSlidesCount() * 2 + 1) {
        // console.log('slides.length <= this.visibleSlidesCount');
        if (this.indexCenter() > 0) {
          this.indexCenter.update(value => value - 1);
        }
      } else {
        this.indexCenter.update(value => (value - 1 + slides.length) % slides.length);
      }
    }
  }

  updateActiveSlide() {
    const slides = this.allSlides();
    if (slides) {
      // Учитываем только оригинальные слайды для центра
      const centerIndexInOriginal = this.indexCenter() % this.originalSlidesLength;

      slides.forEach((slide, index) => {
        // Устанавливаем класс .active только для слайда, соответствующего centerIndexInOriginal
        slide.isActive = (index % this.originalSlidesLength) === centerIndexInOriginal;
      });
    }
  }

  getSlideState(index: number): boolean {
    const slides = this.allSlides();
    if (slides) {
      const totalSlides = slides.length;

      // Проверяем, находится ли слайд в начале или в конце списка
      const isAtStart = index === 0 && this.indexCenter() === totalSlides - 1;
      const isAtEnd = index === totalSlides - 1 && this.indexCenter() === 0;

      // Скрываем слайды, которые перемещаются с конца в начало и наоборот
      const isVisible = !isAtStart && !isAtEnd;
      return isVisible;
    }
    return false;
  }

  toggleOpen(index: number, event?: MouseEvent): void {
    if (this.blockEvent() === false) {
      // console.log('toggle info');
      const slideElement = document.querySelector(`.slide:nth-child(${index + 1})`) as HTMLElement;
      const sliderContainer = document.querySelector('.slider-container') as HTMLElement;
      const imgWrapper = document.querySelector('.img-wrapper') as HTMLElement;
      const infoBlocks = document.querySelectorAll('.info-block') as NodeListOf<HTMLElement>;

      if (!slideElement || !sliderContainer || !imgWrapper) return;

      // Рассчитываем ширину info-block по умолчанию
      const sliderContainerParams = sliderContainer.getBoundingClientRect();
      const infoBlockWidth = sliderContainerParams.width - (sliderContainerParams.width / 2.2);

      // Устанавливаем ширину для всех info-block по умолчанию
      infoBlocks.forEach((block) => {
        if (this.screenWidth() < 1024) {
          block.style.width = `${Math.round(sliderContainerParams.width)}px`;
        } else {
          block.style.width = `${Math.round(infoBlockWidth)}px`;
        };
      });

      const toggleClass = (element: HTMLElement, className: string) => {
        element.classList.toggle(className);
      };

      const setSlideDimensions = (width: string, height: string, transform?: string) => {
        slideElement.style.setProperty('width', width);
        slideElement.style.setProperty('height', height);
        if (transform) {
          slideElement.style.setProperty('transform', transform);
        }
      };

      if (slideElement.classList.contains('opened')) {
        toggleClass(slideElement, 'opened');
        this.opened.set(false);

        infoBlocks.forEach((block, i) => {
          if (i === index) {
            block.classList.remove('opened');
          }
        });

        setSlideDimensions(`${this.slideWidth()}px`, `${this.slideHeight()}px`);
      } else {
        toggleClass(slideElement, 'opened');
        this.opened.set(true);

        infoBlocks.forEach((block, i) => {
          if (i === index) {
            block.classList.add('opened');
          }
        });

        setSlideDimensions(`${this.slideWidth()}px`, `${this.slideHeight()}px`, 'translate(0px,0px)');

        const transitionDuration = 500;
        const openedSlideWidth = sliderContainerParams.width / 2.2;
        if (this.screenWidth() < 1024) {
          setSlideDimensions(`${sliderContainerParams.width}px`, `300px`);
        } else {
          setSlideDimensions(`${openedSlideWidth}px`, `${sliderContainerParams.height}px`);
        };

        setTimeout(() => {
          const slideParams = slideElement.getBoundingClientRect();
          if (this.screenWidth() < 1024) {
            const transform = `translate(${Math.floor(sliderContainerParams.right - slideParams.right)}px, ${-sliderContainerParams.top}px)`;
            setSlideDimensions(`${Math.round(sliderContainerParams.width)}px`, `${Math.round(sliderContainerParams.height / 2)}px`, transform);
          } else {
            const transform = `translate(${Math.floor(sliderContainerParams.right - slideParams.right)}px, ${-sliderContainerParams.top}px)`;
            setSlideDimensions(`${Math.round(openedSlideWidth)}px`, `${Math.round(sliderContainerParams.height)}px`, transform);
          };
        }, transitionDuration);
      }
    }
  }
}
