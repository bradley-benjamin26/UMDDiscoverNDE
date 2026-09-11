import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkipToMainMenuComponent } from './skip-to-main-menu.component';

describe('SkipToMainMenuComponent', () => {
  let component: SkipToMainMenuComponent;
  let fixture: ComponentFixture<SkipToMainMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkipToMainMenuComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SkipToMainMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
