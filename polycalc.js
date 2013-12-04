if ( ! window.jQuery || ! CSSParser) {

	// Check dependencies
	alert("PolyCalc requires jQuery and JSCSSP to function. Disabling.");

} else {

	// Define custom 'startsWith' function
	if (typeof String.prototype.startsWith != 'function') {
		String.prototype.startsWith = function (str){
    		return this.slice(0, str.length) == str;
  		};
	}

	
	$(document).ready(function() {

		window.PolyCalc = new function() {

			this.abort = false;
			

			this.initiate = function() {

				var parser = new CSSParser();


				// -------------------------------------------------------------
				// Call the relevant function depending on location of styles
				
				// In-page <style> blocks...
				var styleSheets = $("style");
				styleSheets.each(function() {
					if ($(this).html() !== '') { // ignore empty style blocks
						parseStyleSheet(parser, $(this).html());
					}
				});
				
				// Linked stylesheets...
				styleSheets = $("link[rel='stylesheet']");
				styleSheets.each(function() {
					$.get($(this).attr("href"), function(data){
						if (data !== '') { // ignore empty stylsheets
							parseStyleSheet(parser, data);
						}
					});
				});
				
				// Inline styles...
				// Do not use inline styles if you are building for Internet Explorer!
				$("*").each(function() { // $("[style*='calc(']"); fails for Chrome
					if($(this).attr("style") === undefined)
						return;

					if(($(this).attr("style").indexOf("calc(") !== -1) && ($(this).attr("style").indexOf("-calc(") === -1)) {
						parseInline(parser, $(this));
					}
				});
			}



			// -------------------------------------------------------------------------
			// Depending on location of styles, either loop over selectors or properties and call relevant function to process further
			
			// For in-page <style> blocks and linked stylesheets...
			var parseStyleSheet = function(parser, source) {
				var styleSheet = parser.parse(source, false, false);

				if (styleSheet.cssRules) {
					var selectors = styleSheet.cssRules;
				} else { // IE8 and below
					var selectors = styleSheet.rules;
				}
				for(var i = 0; i < selectors.length; ++i) {
					var selector = selectors[i];
					parseSelector(selector, false);
				}
			}
			
			// For inline styles...
			var parseInline = function(parser, element) {
				var source = "* { " + element.attr("style") + " }";
				var style = parser.parse(source, false, false);
				
				// get properties
				if (style.cssRules) {
					var properties = style.cssRules[0].declarations;
				} else { // IE8 and below
					var properties = style.rules[0].declarations;
				}
				for(var i = 0; i < properties.length; ++i) {
					var property = properties[i];
					
					parseProperty(element, property, true); // 3rd arg is 'elementKnown'. Because these are inline styles we know what the element is as the style is attached directly to an HTML element)
				}
			}


			
			// For in-page <style> blocks and linked stylesheets, parse selector first, then call parseProperty()
			// selector = e.g. 'width'
			var parseSelector = function(selector) {
				var properties = selector.declarations; // get properties

				if (properties !== undefined) {
					for(var i = 0; i < properties.length; ++i) {
						var property = properties[i];
						
						parseProperty(selector, property, false); // 3rd arg is 'elementKnown'. Because these are stylesheet styles we don't definitely know what the element is as the style could be defined on a class or id rather than an HTML element.)
					}
				}
			}



			// Parse CSS property
			// property = e.g. '100px'
			var parseProperty = function(selector, property, elementKnown) {
				
				var values = property.values;

				// Loop over each value in the property, in case it's a shorthand style rule containing multiple values.
				for(var i = 0; i < values.length; ++i) {
					var value = values[i];

					if( ! elementKnown) {
						var selectorValue = selector.selectorText(); // If element not known, retrieve the HTML element this selector applies to
					}
						
					var propertyValue = property.property;
					var valueValue = value.value;

					// Does the value contain 'calc(' or '-calc('? (Takes into account browser prefixes). If so, process it.
					if ((valueValue.indexOf("calc(") !== -1) && (valueValue.indexOf("-calc(") === -1)) {

						if (elementKnown) {
							elements = selector;
						} else {
							elements = $(selectorValue);
						}
						
						// Calculate calc() and return as a fixed px size
						var update = function() {

							// Loop over each element in the document that this style applies to
							elements.each(function() {
								var newValue = parseExpression(propertyValue, valueValue, $(this)) + "px";
								// apply the caclulcated value to the relevant element in the DOM
								$(this).css(propertyValue, newValue);
							});
						}

						// Call update() on load and window resize events
						$(window).resize(update);
						update();
					}
				}
			}
			
			// Parse the calc() expression
			var parseExpression = function(propertyValue, expression, element) {
				// propertyValue : e.g. 'width'
				// expression : e.g. 'calc(50% + 20px)'
				// element : the actual DOM object the style relates to

				var newExpression = "";

				// retrieve the stuff that needs calculating from the calc(...) expression
				regex = expression.match(/^calc\((.+)\)$/);
				if (regex !== null) {
					expression = expression.match(/^calc\((.+)\)$/)[1];
				}
				
				var value = -1;
				// Loop over each character inside calc()
				for(var i = 0; i < expression.length; ++i) {
					
					var substr = expression.substring(i);
					
					// Numbers
					var regex = substr.match(/^[\d.]+/);
					if(regex !== null) {

						// Convert number string into a floating point number
						value = parseFloat(regex[0], 10);
						
						i += regex[0].length - 1;
						
						continue;
					}
					
					// Units ( px, %, em, rem, in, pt, pc, mm, cm )
					regex = substr.match(/^([A-Za-z]+|%)/);
					if (regex !== null) {

						// Convert to a corresponding px value
						value = convertUnit(regex[1], "px", value, propertyValue, element);
						
						if (value !== -1)
							newExpression += value;
							
						i += regex[1].length - 1;
						value = -1;
							
						continue;
					}
					
					// Math operators and symbols ( +, -, *, /, (, ) )
					var char = expression.charAt(i);
					if(char === '+' || char === '-' || char === '*' || char === '/' || char === '(' || char === ')') {
						newExpression += char;
						value = -1;
					}
				}

				// Do the maths and return the px value!
				return eval(newExpression);
			}
			
			// Convert any kind of CSS unit to it's px value
			var convertUnit = function(from, to, value, propertyValue, element) {
				switch(to) {
					case "px": {
						switch(from) {
							case "px":
								return value;
							case "%":
								value *= 0.01;
								value *= parseInt(element.parent().css(propertyValue), 10);
								return value;
							case "em":
								value *= parseInt(element.parent().css("font-size"), 10);
								return value;
							case "rem":
								value *= parseInt($("body").css("font-size"), 10);
								return value;
							case "in":
								value *= 96;
								return value;
							case "pt":
								value *= 4/3;
								return value;
							case "pc":
								value *= 16;
								return value;
							case "mm":
								value *= 9.6;
								value /= 2.54
								return value;
							case "cm":
								value *= 96;
								value /= 2.54
								return value;
						}
						
						break;
					}
				}
				
				return -1;
			}
		};
		
		PolyCalc.initiate();
	});	
}
