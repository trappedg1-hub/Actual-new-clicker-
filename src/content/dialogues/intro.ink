VAR affection_delta = 0
VAR response_id = "none"
-> intro

=== intro ===
HEROINE-01: Ты вернулся. Мне нравятся наши спокойные вечера.

* [Я хотел увидеть тебя.]
    ~ affection_delta = 3
    ~ response_id = "warm"
    HEROINE-01: Тогда останься ещё немного. Мне приятно это слышать.
    -> END

* [Я просто проверял, как идут дела.]
    ~ affection_delta = 1
    ~ response_id = "casual"
    HEROINE-01: Здесь всё спокойнее, когда ты заглядываешь.
    -> END
